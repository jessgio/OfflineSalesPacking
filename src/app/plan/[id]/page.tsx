"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Cloud,
  CloudOff,
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
import { loadCartonPlanDraft, persistCartonPlanDraft } from "../../../lib/sociolla/cartonPlanDb";
import { useDebouncedCallback } from "../../../hooks/useDebouncedCallback";
import { DashButton, SurfaceCard } from "../../../components/dashboard/primitives";

const fieldInput =
  "border border-slate-300 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500";

const CARTON_PAGE_SIZE = 25;
const AUTOSAVE_DELAY_MS = 600;

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export default function CartonPlanPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<PoItemForPlan[]>([]);
  const [plan, setPlan] = useState<CartonPlanBox[]>([]);
  const [unitsPerBox, setUnitsPerBox] = useState<Record<string, number>>({});
  const [bulkSkuBarcode, setBulkSkuBarcode] = useState<string>("");
  const [bulkBoxCount, setBulkBoxCount] = useState(1);
  const [bulkPcsPerBox, setBulkPcsPerBox] = useState(1);
  const [itemSearch, setItemSearch] = useState("");
  const [cartonSearch, setCartonSearch] = useState("");
  const [cartonPage, setCartonPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState({ text: "", type: "" as "info" | "error" | "success" });

  const planRef = useRef(plan);
  const saveErrorRef = useRef<string | null>(null);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
    const { data: itemsData } = await supabase
      .from("po_items")
      .select("id, barcode, product_name, target_qty, retailer_sku")
      .eq("po_id", poId);

    if (poData) setPo(poData);
    if (itemsData) {
      setItems(itemsData);
      const defaults: Record<string, number> = {};
      itemsData.forEach((item) => {
        defaults[item.barcode] = item.target_qty <= 3 ? item.target_qty : 1;
      });
      setUnitsPerBox(defaults);
      setBulkSkuBarcode((prev) => prev || itemsData[0]?.barcode || "");
    }

    try {
      const savedPlan = await loadCartonPlanDraft(poId);
      if (savedPlan) setPlan(savedPlan);
    } catch {
      setMessage({ text: "Could not load saved draft plan.", type: "error" });
    }

    setLoading(false);
  }, [poId]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = useMemo(() => remainingQtyByItem(plan, items), [plan, items]);
  const validationErrors = useMemo(() => validateCartonPlan(plan, items), [plan, items]);

  const flushSave = useCallback(async (nextPlan: CartonPlanBox[]) => {
    setSaveStatus("saving");
    try {
      await persistCartonPlanDraft(poId, nextPlan);
      saveErrorRef.current = null;
      setSaveStatus("saved");
    } catch (err) {
      saveErrorRef.current = err instanceof Error ? err.message : "Failed to save draft";
      setSaveStatus("error");
    }
  }, [poId]);

  const debouncedSave = useDebouncedCallback((nextPlan: CartonPlanBox[]) => {
    void flushSave(nextPlan);
  }, AUTOSAVE_DELAY_MS);

  const applyPlan = useCallback(
    (nextPlan: CartonPlanBox[]) => {
      setPlan(nextPlan);
      planRef.current = nextPlan;
      setSaveStatus("pending");
      debouncedSave(nextPlan);
    },
    [debouncedSave]
  );

  const flushSaveNow = useCallback(async () => {
    await flushSave(planRef.current);
  }, [flushSave]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "pending" || saveStatus === "saving") {
        e.preventDefault();
        void flushSaveNow();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus, flushSaveNow]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.product_name.toLowerCase().includes(q) ||
        item.barcode.includes(q) ||
        (item.retailer_sku ?? "").toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  const filteredCartonIndices = useMemo(() => {
    const q = cartonSearch.trim().toLowerCase();
    if (!q) return plan.map((_, index) => index);
    return plan
      .map((carton, index) => ({ carton, index }))
      .filter(({ carton, index }) => {
        const boxLabel = `inner box ${index + 1}`;
        if (boxLabel.includes(q)) return true;
        return carton.lines.some(
          (line) =>
            line.productName.toLowerCase().includes(q) ||
            line.barcode.includes(q)
        );
      })
      .map(({ index }) => index);
  }, [plan, cartonSearch]);

  const cartonPageCount = Math.max(1, Math.ceil(filteredCartonIndices.length / CARTON_PAGE_SIZE));
  const safeCartonPage = Math.min(cartonPage, cartonPageCount);

  const visibleCartonIndices = useMemo(() => {
    const start = (safeCartonPage - 1) * CARTON_PAGE_SIZE;
    return filteredCartonIndices.slice(start, start + CARTON_PAGE_SIZE);
  }, [filteredCartonIndices, safeCartonPage]);

  useEffect(() => {
    setCartonPage(1);
  }, [cartonSearch]);

  const addCarton = () => {
    applyPlan([...plan, emptyCarton()]);
  };

  const bulkAddCartons = () => {
    const sku = bulkSkuBarcode || items[0]?.barcode || "";
    const item = items.find((i) => i.barcode === sku);
    if (!item) {
      setMessage({ text: "Choose a SKU to bulk-add boxes for.", type: "error" });
      return;
    }

    const count = Math.max(1, Math.floor(bulkBoxCount || 1));
    const pcs = Math.max(1, Math.floor(bulkPcsPerBox || 1));
    const leftStart = remaining[item.barcode] ?? item.target_qty;
    if (leftStart <= 0) {
      setMessage({ text: `No remaining pieces for ${item.product_name}.`, type: "error" });
      return;
    }

    let left = leftStart;
    const newCartons: CartonPlanBox[] = [];
    for (let i = 0; i < count; i++) {
      if (left <= 0) break;
      const qty = Math.min(pcs, left);
      newCartons.push({
        id: crypto.randomUUID(),
        lines: [
          {
            poItemId: item.id,
            barcode: item.barcode,
            productName: item.product_name,
            qty,
          },
        ],
      });
      left -= qty;
    }

    if (newCartons.length === 0) {
      setMessage({ text: "Nothing to add.", type: "error" });
      return;
    }

    applyPlan([...plan, ...newCartons]);
    setMessage({
      text: `Added ${newCartons.length} inner box(es) for ${item.product_name} (${pcs} pcs/box).`,
      type: "success",
    });
  };

  const clearPlan = () => {
    const ok = window.confirm("Clear all inner boxes from this draft plan? This cannot be undone after save.");
    if (!ok) return;
    applyPlan([]);
    setMessage({ text: "Draft plan cleared.", type: "info" });
  };

  const removeCarton = (cartonId: string) => {
    applyPlan(plan.filter((c) => c.id !== cartonId));
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
    applyPlan(next);
  };

  const updateLineQty = (cartonId: string, barcode: string, qty: number) => {
    const next = plan.map((carton) => {
      if (carton.id !== cartonId) return carton;
      return {
        ...carton,
        lines: carton.lines
          .map((l) => (l.barcode === barcode ? { ...l, qty: Math.max(0, qty) } : l))
          .filter((l) => l.qty > 0),
      };
    });
    applyPlan(next);
  };

  const removeLine = (cartonId: string, barcode: string) => {
    const next = plan.map((carton) => {
      if (carton.id !== cartonId) return carton;
      return { ...carton, lines: carton.lines.filter((l) => l.barcode !== barcode) };
    });
    applyPlan(next);
  };

  const handleAutoGenerate = () => {
    const ok = window.confirm(
      plan.length > 0
        ? "Replace the current inner box plan with auto-generated boxes from your pcs/inner box settings?"
        : "Auto-generate inner boxes from your pcs/inner box settings?"
    );
    if (!ok) return;
    const generated = buildSingleSkuCartons(items, unitsPerBox);
    applyPlan(generated);
    setMessage({
      text: `Generated ${generated.length} inner box(es). You can still merge or edit them.`,
      type: "success",
    });
  };

  const handleFinalize = async () => {
    const errors = validateCartonPlan(plan, items);
    if (errors.length > 0) {
      setMessage({ text: errors[0], type: "error" });
      return;
    }

    setSaving(true);
    setMessage({ text: "Saving draft and generating LPN labels…", type: "info" });
    try {
      await flushSaveNow();
      if (saveErrorRef.current) throw new Error(saveErrorRef.current);
      await finalizeCartonPlan(supabase, poId, po.po_number, planRef.current, items);
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

  const saveStatusLabel = (() => {
    switch (saveStatus) {
      case "pending":
        return "Unsaved changes…";
      case "saving":
        return "Saving draft…";
      case "saved":
        return "Draft saved";
      case "error":
        return "Save failed — retrying on next edit";
      default:
        return plan.length > 0 ? "Draft loaded" : "";
    }
  })();

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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Plan already finalized</h2>
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
  const showCartonPagination = filteredCartonIndices.length > CARTON_PAGE_SIZE;

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
              {saveStatusLabel && (
                <p
                  className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${
                    saveStatus === "error"
                      ? "text-red-600"
                      : saveStatus === "pending"
                        ? "text-amber-700"
                        : "text-slate-500"
                  }`}
                >
                  {saveStatus === "error" ? (
                    <CloudOff className="w-3.5 h-3.5" />
                  ) : saveStatus === "saving" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  {saveStatusLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {plan.length > 0 && (
              <DashButton
                onClick={clearPlan}
                variant="ghost"
                size="sm"
                className="text-red-700 border border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Clear all
              </DashButton>
            )}
            <button
              onClick={handleFinalize}
              disabled={saving || validationErrors.length > 0}
              className="bg-pink-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-pink-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
              Finalize &amp; generate LPNs
            </button>
          </div>
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
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search SKU or product name…"
                className={`${fieldInput} w-full pl-9`}
              />
            </div>
            <ul className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <li className="text-sm text-slate-600 text-center py-6">No SKUs match your search.</li>
              ) : (
                filteredItems.map((item) => {
                  const left = remaining[item.barcode] ?? item.target_qty;
                  return (
                    <li key={item.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <p className="font-semibold text-slate-900 text-sm leading-snug">{item.product_name}</p>
                      {item.retailer_sku && (
                        <p className="text-xs text-slate-600 font-mono mt-0.5">[{item.retailer_sku}]</p>
                      )}
                      <div className="flex justify-between items-center mt-2 text-sm">
                        <span className="text-slate-600">
                          Ordered: <strong className="text-slate-900">{item.target_qty}</strong>
                        </span>
                        <span
                          className={
                            left === 0
                              ? "text-green-700 font-bold"
                              : left < 0
                                ? "text-red-700 font-bold"
                                : "text-amber-800 font-bold"
                          }
                        >
                          {left === 0
                            ? "Fully assigned"
                            : left < 0
                              ? `Over by ${Math.abs(left)}`
                              : `${left} left`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200">
                        <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                          Pcs / inner box
                        </label>
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
                })
              )}
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
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center gap-2">
              <h2 className="font-bold text-slate-900">
                Inner boxes ({plan.length}
                {cartonSearch && filteredCartonIndices.length !== plan.length
                  ? ` · ${filteredCartonIndices.length} shown`
                  : ""}
                )
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                <select
                  value={bulkSkuBarcode}
                  onChange={(e) => setBulkSkuBarcode(e.target.value)}
                  className={`${fieldInput} w-56`}
                  title="SKU for bulk boxes"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.barcode}>
                      {i.product_name.slice(0, 40)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={bulkBoxCount}
                  onChange={(e) => setBulkBoxCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${fieldInput} w-20 text-center`}
                  title="Number of boxes"
                />
                <span className="text-xs font-semibold text-slate-600">boxes ×</span>
                <input
                  type="number"
                  min={1}
                  value={bulkPcsPerBox}
                  onChange={(e) => setBulkPcsPerBox(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${fieldInput} w-20 text-center`}
                  title="Pieces per box"
                />
                <span className="text-xs font-semibold text-slate-600">pcs</span>
                <DashButton
                  onClick={bulkAddCartons}
                  variant="ghost"
                  size="sm"
                  className="text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100"
                  title="Add X boxes with Y pcs"
                >
                  <Plus className="w-4 h-4" /> Bulk add
                </DashButton>
              </div>
              <DashButton
                onClick={addCarton}
                variant="ghost"
                size="sm"
                className="text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100"
              >
                <Plus className="w-4 h-4" /> Add empty box
              </DashButton>
            </div>
            {plan.length > 8 && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={cartonSearch}
                  onChange={(e) => setCartonSearch(e.target.value)}
                  placeholder="Filter inner boxes by SKU or box number…"
                  className={`${fieldInput} w-full pl-9`}
                />
              </div>
            )}
          </div>

          {plan.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-600">
              No inner boxes yet. Use auto-generate or add an empty box, then assign SKUs.
            </div>
          ) : filteredCartonIndices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600">
              No inner boxes match your filter.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                {visibleCartonIndices.map((index) => {
                  const carton = plan[index];
                  return (
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
                        <p className="text-sm text-slate-600 mb-3">No SKUs in this box yet — add from the list below.</p>
                      ) : (
                        <ul className="space-y-2 mb-3">
                          {carton.lines.map((line) => (
                            <li
                              key={line.barcode}
                              className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                            >
                              <span className="flex-1 min-w-0 font-medium text-slate-900 leading-snug">
                                {line.productName}
                              </span>
                              <label className="sr-only">Quantity</label>
                              <input
                                type="number"
                                min={1}
                                value={line.qty}
                                onChange={(e) =>
                                  updateLineQty(carton.id, line.barcode, parseInt(e.target.value, 10) || 0)
                                }
                                onBlur={(e) => {
                                  const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  if (qty !== line.qty) updateLineQty(carton.id, line.barcode, qty);
                                }}
                                className={`${fieldInput} w-16 text-center`}
                              />
                              <DashButton
                                onClick={() => removeLine(carton.id, line.barcode)}
                                className="text-slate-600 hover:text-red-600 p-1"
                                title="Remove from box"
                              >
                                <X className="w-4 h-4" />
                              </DashButton>
                            </li>
                          ))}
                        </ul>
                      )}

                      {items.some((item) => (remaining[item.barcode] ?? 0) > 0) && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                            Add SKU to this box
                          </p>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {items
                              .filter((item) => (remaining[item.barcode] ?? 0) > 0)
                              .map((item) => (
                                <DashButton
                                  key={item.id}
                                  onClick={() =>
                                    addLineToCarton(carton.id, item, unitsPerBox[item.barcode] ?? 1)
                                  }
                                  className="text-xs bg-white border border-slate-300 hover:border-pink-400 hover:bg-pink-50 text-slate-800 px-2.5 py-1.5 rounded-md font-medium text-left"
                                >
                                  + {item.product_name.slice(0, 32)}
                                  {(remaining[item.barcode] ?? 0) > 1
                                    ? ` (×${Math.min(unitsPerBox[item.barcode] ?? 1, remaining[item.barcode] ?? 1)})`
                                    : ""}
                                </DashButton>
                              ))}
                          </div>
                        </div>
                      )}
                    </SurfaceCard>
                  );
                })}
              </div>

              {showCartonPagination && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Showing {visibleCartonIndices[0] + 1}–
                    {visibleCartonIndices[visibleCartonIndices.length - 1] + 1} of {filteredCartonIndices.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <DashButton
                      onClick={() => setCartonPage((p) => Math.max(1, p - 1))}
                      disabled={safeCartonPage <= 1}
                      variant="subtle"
                      size="sm"
                    >
                      Previous
                    </DashButton>
                    <span className="text-sm font-semibold text-slate-700">
                      Page {safeCartonPage} / {cartonPageCount}
                    </span>
                    <DashButton
                      onClick={() => setCartonPage((p) => Math.min(cartonPageCount, p + 1))}
                      disabled={safeCartonPage >= cartonPageCount}
                      variant="subtle"
                      size="sm"
                    >
                      Next
                    </DashButton>
                  </div>
                </div>
              )}
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
