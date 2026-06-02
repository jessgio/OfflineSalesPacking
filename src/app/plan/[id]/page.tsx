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
  remainingQtyByItem,
  validateCartonPlan,
} from "../../../lib/sociolla/cartonPlan";
import { DashButton, SurfaceCard } from "../../../components/dashboard/primitives";

/** Force readable fields regardless of OS dark-mode (globals use light-on-dark foreground). */
const fieldInput =
  "border border-slate-300 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500";
export default function CartonPlanPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<PoItemForPlan[]>([]);
  const [plan, setPlan] = useState<CartonPlanBox[]>([]);
  const [unitsPerBox, setUnitsPerBox] = useState<Record<string, number>>({});
  const [bulkBoxCount, setBulkBoxCount] = useState(1);
  const [bulkPcsPerBox, setBulkPcsPerBox] = useState(1);
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

  const addBulkCartons = () => {
    const count = Math.max(1, bulkBoxCount);
    const pcsPerBox = Math.max(1, bulkPcsPerBox);
    const newCartons: CartonPlanBox[] = [];
    let workingPlan = [...plan];

    for (let i = 0; i < count; i++) {
      const currentRemaining = remainingQtyByItem(workingPlan, items);
      const carton = emptyCarton();
      carton.lines = items
        .map((item) => ({
          poItemId: item.id,
          barcode: item.barcode,
          productName: item.product_name,
          qty: Math.min(pcsPerBox, Math.max(0, currentRemaining[item.barcode] ?? 0)),
        }))
        .filter((line) => line.qty > 0);
      newCartons.push(carton);
      workingPlan = [...workingPlan, carton];
    }

    void persistPlan([...plan, ...newCartons]);
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

  const orderTotal = items.reduce((s, i) => s + i.target_qty, 0);
  const assignedTotal = orderTotal - Object.values(remaining).reduce((s, n) => s + Math.max(n, 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
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

      <div className="max-w-6xl mx-auto px-6 pt-4">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-900">{assignedTotal}</span> of{" "}
            <span className="font-bold text-slate-900">{orderTotal}</span> pieces assigned to inner boxes
          </p>
          <div className="h-2 flex-1 min-w-[120px] max-w-xs bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-pink-500 transition-all"
              style={{ width: `${orderTotal ? Math.min(100, (assignedTotal / orderTotal) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
        <section className="space-y-4">
          <SurfaceCard className="p-5 border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Package className="w-5 h-5 text-pink-600" /> PO line items
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Set pieces per inner box, auto-generate, or combine low-qty SKUs into shared cartons.
            </p>
            <ul className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {items.map((item) => {
                const left = remaining[item.barcode] ?? item.target_qty;
                return (
                  <li key={item.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{item.product_name}</p>
                    {item.retailer_sku && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">[{item.retailer_sku}]</p>
                    )}
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="text-slate-600">Ordered: <strong className="text-slate-900">{item.target_qty}</strong></span>
                      <span className={left === 0 ? "text-green-700 font-bold" : left < 0 ? "text-red-700 font-bold" : "text-amber-800 font-bold"}>
                        {left === 0 ? "Fully assigned" : left < 0 ? `Over by ${Math.abs(left)}` : `${left} left`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200">
                      <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">Pcs / inner box</label>
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
                        className={`${fieldInput} w-20`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <DashButton
              onClick={handleAutoGenerate}
              variant="ghost"
              size="lg"
              className="mt-4 w-full border-2 border-dashed border-pink-300 text-pink-800 bg-pink-50/50 hover:bg-pink-100"
            >
              <Sparkles className="w-4 h-4" /> Auto-generate from &quot;pcs / inner box&quot;
            </DashButton>
          </SurfaceCard>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-slate-900">Inner boxes ({plan.length})</h2>

          {/* Bulk add panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick add</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Boxes</label>
                <input
                  type="number"
                  min={1}
                  value={bulkBoxCount}
                  onChange={(e) => setBulkBoxCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${fieldInput} w-20 text-center`}
                />
              </div>
              <span className="text-slate-400 text-lg font-light pb-1.5">×</span>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Pcs / box</label>
                <input
                  type="number"
                  min={1}
                  value={bulkPcsPerBox}
                  onChange={(e) => setBulkPcsPerBox(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${fieldInput} w-20 text-center`}
                />
              </div>
              <button
                onClick={addBulkCartons}
                className="flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold px-4 py-1.5 rounded-md mb-0.5"
              >
                <Plus className="w-4 h-4" /> Add boxes
              </button>
            </div>
            <button
              onClick={() => void persistPlan([...plan, emptyCarton()])}
              className="mt-3 text-xs text-slate-400 hover:text-pink-600 transition-colors"
            >
              + Add single empty box
            </button>
          </div>

          {plan.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500 text-sm">
              No inner boxes yet. Enter boxes and pcs above, then click Add boxes — or use auto-generate on the left.
            </div>
          ) : (
            <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {plan.map((carton, index) => (
              <SurfaceCard key={carton.id} className="p-4 border-slate-200">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-900">Inner box {index + 1}</span>
                  <DashButton
                    onClick={() => removeCarton(carton.id)}
                    className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                    title="Remove box"
                  >
                    <Trash2 className="w-4 h-4" />
                  </DashButton>
                </div>

                {carton.lines.length === 0 ? (
                  <p className="text-sm text-slate-500 mb-3">No SKUs in this box yet — add from the list below.</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {carton.lines.map((line) => (
                      <li key={line.barcode} className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                        <span className="flex-1 min-w-0 font-medium text-slate-900 leading-snug truncate" title={line.productName}>{line.productName}</span>
                        <label className="sr-only">Quantity</label>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) =>
                            updateLineQty(carton.id, line.barcode, parseInt(e.target.value, 10) || 0)
                          }
                          className={`${fieldInput} w-16 text-center`}
                        />
                        <DashButton
                          onClick={() => removeLine(carton.id, line.barcode)}
                          className="text-slate-500 hover:text-red-600 p-1"
                          title="Remove from box"
                        >
                          <X className="w-4 h-4" />
                        </DashButton>
                      </li>
                    ))}
                  </ul>
                )}

                {(items.some((item) => (remaining[item.barcode] ?? 0) > 0)) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Add SKU to this box</p>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {items
                    .filter((item) => (remaining[item.barcode] ?? 0) > 0)
                    .map((item) => (
                      <DashButton
                        key={item.id}
                        onClick={() => addLineToCarton(carton.id, item, unitsPerBox[item.barcode] ?? 1)}
                        className="text-xs bg-white border border-slate-300 hover:border-pink-400 hover:bg-pink-50 text-slate-800 px-2.5 py-1.5 rounded-md font-medium text-left max-w-[200px] truncate"
                        title={item.product_name}
                      >
                        + {item.product_name}
                        {(remaining[item.barcode] ?? 0) > 1 ? ` (×${Math.min(unitsPerBox[item.barcode] ?? 1, remaining[item.barcode] ?? 1)})` : ""}
                      </DashButton>
                    ))}
                    </div>
                  </div>
                )}
              </SurfaceCard>
            ))}
            </div>
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
