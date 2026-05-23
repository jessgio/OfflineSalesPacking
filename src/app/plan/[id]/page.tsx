"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Package,
  AlertCircle,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import type { CartonPlanBox, PoItemForPlan } from "../../../types/cartonPlan";
import {
  buildSingleSkuCartons,
  emptyCarton,
  finalizeCartonPlan,
  newCartonId,
  remainingQtyByItem,
  validateCartonPlan,
} from "../../../lib/sociolla/cartonPlan";

export default function CartonPlanPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<PoItemForPlan[]>([]);
  const [plan, setPlan] = useState<CartonPlanBox[]>([]);
  const [unitsPerBox, setUnitsPerBox] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" as "info" | "error" | "success" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
    const { data: itemsData } = await supabase.from("po_items").select("id, barcode, product_name, target_qty, retailer_sku").eq("po_id", poId);
    const { data: planRow } = await supabase.from("po_carton_plans").select("plan").eq("po_id", poId).maybeSingle();

    if (poData) setPo(poData);
    if (itemsData) {
      setItems(itemsData);
      const defaults: Record<string, number> = {};
      itemsData.forEach((item) => {
        defaults[item.barcode] = item.target_qty <= 3 ? item.target_qty : 1;
      });
      setUnitsPerBox(defaults);
    }
    if (planRow?.plan && Array.isArray(planRow.plan)) {
      setPlan(planRow.plan as CartonPlanBox[]);
    }
    setLoading(false);
  }, [poId]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = useMemo(() => remainingQtyByItem(plan, items), [plan, items]);
  const validationErrors = useMemo(() => validateCartonPlan(plan, items), [plan, items]);

  const persistPlan = async (nextPlan: CartonPlanBox[]) => {
    setPlan(nextPlan);
    await supabase.from("po_carton_plans").upsert({
      po_id: poId,
      plan: nextPlan,
      updated_at: new Date().toISOString(),
    });
  };

  const addCarton = () => {
    void persistPlan([...plan, emptyCarton()]);
  };

  const removeCarton = (cartonId: string) => {
    void persistPlan(plan.filter((c) => c.id !== cartonId));
  };

  const addLineToCarton = (cartonId: string, item: PoItemForPlan, qty: number) => {
    const left = remaining[item.barcode] ?? 0;
    if (left <= 0) return;
    const useQty = Math.min(qty, left);

    const next = plan.map((carton) => {
      if (carton.id !== cartonId) return carton;
      const existing = carton.lines.find((l) => l.barcode === item.barcode);
      if (existing) {
        return {
          ...carton,
          lines: carton.lines.map((l) =>
            l.barcode === item.barcode ? { ...l, qty: l.qty + useQty } : l
          ),
        };
      }
      return {
        ...carton,
        lines: [
          ...carton.lines,
          {
            poItemId: item.id,
            barcode: item.barcode,
            productName: item.product_name,
            qty: useQty,
          },
        ],
      };
    });
    void persistPlan(next);
  };

  const updateLineQty = (cartonId: string, barcode: string, qty: number) => {
    const next = plan.map((carton) => {
      if (carton.id !== cartonId) return carton;
      return {
        ...carton,
        lines: carton.lines
          .map((l) => (l.barcode === barcode ? { ...l, qty } : l))
          .filter((l) => l.qty > 0),
      };
    });
    void persistPlan(next);
  };

  const removeLine = (cartonId: string, barcode: string) => {
    const next = plan.map((carton) => {
      if (carton.id !== cartonId) return carton;
      return { ...carton, lines: carton.lines.filter((l) => l.barcode !== barcode) };
    });
    void persistPlan(next);
  };

  const handleAutoGenerate = () => {
    const generated = buildSingleSkuCartons(items, unitsPerBox);
    void persistPlan(generated);
    setMessage({ text: `Generated ${generated.length} inner box(es) from per-SKU settings. You can still merge or edit them.`, type: "success" });
  };

  const handleFinalize = async () => {
    const errors = validateCartonPlan(plan, items);
    if (errors.length > 0) {
      setMessage({ text: errors[0], type: "error" });
      return;
    }

    setSaving(true);
    setMessage({ text: "Generating LPN labels…", type: "info" });
    try {
      await finalizeCartonPlan(supabase, poId, po.po_number, plan, items);
      setMessage({ text: "Inner boxes finalized. You can print labels and start packing.", type: "success" });
      setTimeout(() => {
        window.location.href = `/labels/${poId}`;
      }, 800);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to finalize.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !po) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-pink-600" />
      </div>
    );
  }

  if (po.carton_plan_status === "finalized") {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="bg-white rounded-xl border p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Plan already finalized</h2>
          <p className="text-gray-600 mb-6">LPN labels were generated for this PO.</p>
          <div className="flex flex-col gap-2">
            <Link href={`/labels/${poId}`} className="bg-blue-600 text-white py-3 rounded-lg font-bold">
              Print LPN Labels
            </Link>
            <Link href="/" className="text-gray-600 py-2">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalAllocated = items.reduce((s, i) => s + i.target_qty, 0) - Object.values(remaining).reduce((s, n) => s + Math.max(n, 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Plan inner boxes</h1>
              <p className="text-sm text-pink-600 font-semibold">PO {po.po_number} · Sociolla</p>
            </div>
          </div>
          <button
            onClick={handleFinalize}
            disabled={saving || validationErrors.length > 0}
            className="bg-pink-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-pink-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
            Finalize &amp; generate LPNs
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
        <section className="space-y-4">
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
              <Package className="w-5 h-5 text-pink-600" /> PO line items
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Assign all {totalAllocated} of {items.reduce((s, i) => s + i.target_qty, 0)} pieces into inner boxes.
              Combine low-qty SKUs into one box when needed.
            </p>
            <ul className="space-y-3">
              {items.map((item) => {
                const left = remaining[item.barcode] ?? item.target_qty;
                return (
                  <li key={item.id} className="border rounded-lg p-3">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{item.product_name}</p>
                    {item.retailer_sku && (
                      <p className="text-xs text-gray-500 font-mono mt-0.5">[{item.retailer_sku}]</p>
                    )}
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="text-gray-600">Ordered: {item.target_qty}</span>
                      <span className={left === 0 ? "text-green-700 font-bold" : left < 0 ? "text-red-600 font-bold" : "text-amber-700 font-bold"}>
                        {left === 0 ? "Fully assigned" : left < 0 ? `Over by ${Math.abs(left)}` : `${left} left`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Pcs / inner box</label>
                      <input
                        type="number"
                        min={1}
                        value={unitsPerBox[item.barcode] ?? 1}
                        onChange={(e) =>
                          setUnitsPerBox((prev) => ({
                            ...prev,
                            [item.barcode]: Math.max(1, parseInt(e.target.value, 10) || 1),
                          }))
                        }
                        className="w-16 border rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={handleAutoGenerate}
              className="mt-4 w-full border-2 border-dashed border-pink-200 text-pink-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-pink-50"
            >
              <Sparkles className="w-4 h-4" /> Auto-generate from &quot;pcs / inner box&quot;
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-gray-900">Inner boxes ({plan.length})</h2>
            <button
              onClick={addCarton}
              className="text-sm font-bold text-pink-600 flex items-center gap-1 hover:text-pink-800"
            >
              <Plus className="w-4 h-4" /> Add empty box
            </button>
          </div>

          {plan.length === 0 ? (
            <div className="bg-white border-2 border-dashed rounded-xl p-10 text-center text-gray-500">
              No inner boxes yet. Use auto-generate or add an empty box, then assign SKUs.
            </div>
          ) : (
            plan.map((carton, index) => (
              <div key={carton.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-gray-900">Inner box {index + 1}</span>
                  <button
                    onClick={() => removeCarton(carton.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove box"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {carton.lines.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-3">No SKUs in this box yet.</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {carton.lines.map((line) => (
                      <li key={line.barcode} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate font-medium">{line.productName}</span>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) =>
                            updateLineQty(carton.id, line.barcode, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-14 border rounded px-2 py-1 text-center"
                        />
                        <button
                          onClick={() => removeLine(carton.id, line.barcode)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  {items
                    .filter((item) => (remaining[item.barcode] ?? 0) > 0)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addLineToCarton(carton.id, item, unitsPerBox[item.barcode] ?? 1)}
                        className="text-xs bg-gray-100 hover:bg-pink-100 text-gray-800 px-2 py-1 rounded font-medium truncate max-w-full"
                      >
                        + {item.product_name.slice(0, 28)}
                        {(remaining[item.barcode] ?? 0) > 1 ? ` (×${Math.min(unitsPerBox[item.barcode] ?? 1, remaining[item.barcode] ?? 1)})` : ""}
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}

          {validationErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-2 text-amber-900 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-1">
                {validationErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {message.text && (
            <div
              className={`p-4 rounded-lg text-sm font-medium border ${
                message.type === "error"
                  ? "bg-red-50 text-red-800 border-red-200"
                  : message.type === "success"
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-blue-50 text-blue-800 border-blue-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
