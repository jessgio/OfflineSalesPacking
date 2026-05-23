import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartonPlanBox, PoItemForPlan } from "../../types/cartonPlan";
import { sociollaLpnBarcode } from "./lpnBarcode";

export function newCartonId(): string {
  return crypto.randomUUID();
}

export function emptyCarton(): CartonPlanBox {
  return { id: newCartonId(), lines: [] };
}

export function allocatedQtyByBarcode(plan: CartonPlanBox[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const box of plan) {
    for (const line of box.lines) {
      totals[line.barcode] = (totals[line.barcode] ?? 0) + line.qty;
    }
  }
  return totals;
}

export function remainingQtyByItem(plan: CartonPlanBox[], items: PoItemForPlan[]): Record<string, number> {
  const allocated = allocatedQtyByBarcode(plan);
  const remaining: Record<string, number> = {};
  for (const item of items) {
    remaining[item.barcode] = item.target_qty - (allocated[item.barcode] ?? 0);
  }
  return remaining;
}

export function validateCartonPlan(
  plan: CartonPlanBox[],
  items: PoItemForPlan[]
): string[] {
  const errors: string[] = [];
  if (plan.length === 0) errors.push("Add at least one inner box.");

  for (let i = 0; i < plan.length; i++) {
    const carton = plan[i];
    if (carton.lines.length === 0) {
      errors.push(`Inner box ${i + 1} has no SKUs.`);
    }
    for (const line of carton.lines) {
      if (line.qty < 1) errors.push(`Inner box ${i + 1}: quantities must be at least 1.`);
    }
  }

  const remaining = remainingQtyByItem(plan, items);
  for (const item of items) {
    const left = remaining[item.barcode] ?? 0;
    if (left > 0) {
      errors.push(`${item.product_name}: ${left} piece(s) still unassigned.`);
    } else if (left < 0) {
      errors.push(`${item.product_name}: over-allocated by ${Math.abs(left)} piece(s).`);
    }
  }

  return errors;
}

/** Generate one-SKU cartons from per-SKU "pieces per inner box" settings. */
export function buildSingleSkuCartons(
  items: PoItemForPlan[],
  unitsPerBoxByBarcode: Record<string, number>
): CartonPlanBox[] {
  const cartons: CartonPlanBox[] = [];

  for (const item of items) {
    const perBox = Math.max(1, unitsPerBoxByBarcode[item.barcode] ?? 1);
    let remaining = item.target_qty;

    while (remaining > 0) {
      const qty = Math.min(remaining, perBox);
      cartons.push({
        id: newCartonId(),
        lines: [
          {
            poItemId: item.id,
            barcode: item.barcode,
            productName: item.product_name,
            qty,
          },
        ],
      });
      remaining -= qty;
    }
  }

  return cartons;
}

export function innerBoxCountByBarcode(plan: CartonPlanBox[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const box of plan) {
    const seen = new Set<string>();
    for (const line of box.lines) {
      if (!seen.has(line.barcode)) {
        counts[line.barcode] = (counts[line.barcode] ?? 0) + 1;
        seen.add(line.barcode);
      }
    }
  }
  return counts;
}

export async function finalizeCartonPlan(
  supabase: SupabaseClient,
  poId: string,
  poNumber: string,
  plan: CartonPlanBox[],
  items: PoItemForPlan[]
): Promise<void> {
  const errors = validateCartonPlan(plan, items);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const { data: existingBoxes } = await supabase.from("po_boxes").select("id").eq("po_id", poId);
  if (existingBoxes?.length) {
    await supabase.from("po_boxes").delete().eq("po_id", poId);
  }

  const totalCartons = plan.length;
  const boxCounts = innerBoxCountByBarcode(plan);

  for (let i = 0; i < plan.length; i++) {
    const carton = plan[i];
    const boxBarcode = sociollaLpnBarcode(poNumber, i + 1);

    const { data: box, error: boxError } = await supabase
      .from("po_boxes")
      .insert({
        po_id: poId,
        product_barcode: carton.lines[0]?.barcode ?? "",
        box_barcode: boxBarcode,
        carton_number: i + 1,
        total_cartons: totalCartons,
        is_scanned: false,
      })
      .select("id")
      .single();

    if (boxError || !box) throw new Error(boxError?.message ?? "Failed to create inner box label.");

    const { error: contentsError } = await supabase.from("po_box_contents").insert(
      carton.lines.map((line) => ({
        po_box_id: box.id,
        product_barcode: line.barcode,
        qty: line.qty,
        scanned_qty: 0,
      }))
    );

    if (contentsError) throw new Error(contentsError.message);
  }

  for (const item of items) {
    const { error } = await supabase
      .from("po_items")
      .update({ inner_boxes: boxCounts[item.barcode] ?? 0 })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
  }

  const { error: poError } = await supabase
    .from("purchase_orders")
    .update({ carton_plan_status: "finalized", status: "Not Started" })
    .eq("id", poId);

  if (poError) throw new Error(poError.message);
}

export function isSociollaCartonPo(po: {
  carton_plan_status?: string | null;
  retailer_name?: string | null;
}): boolean {
  if (po.carton_plan_status === "draft" || po.carton_plan_status === "finalized") return true;
  return (po.retailer_name ?? "").toLowerCase() === "sociolla";
}

export function needsCartonPlanning(po: { carton_plan_status?: string | null }): boolean {
  return po.carton_plan_status === "draft";
}
