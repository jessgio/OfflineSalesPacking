"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Box, Loader2, Package, Plus, RotateCcw } from "lucide-react";
import {
  AlertBanner,
  BackLink,
  BtnPrimary,
  EmptyState,
  MasterShipShell,
  PageTitle,
  SectionCard,
  StatusBadge,
  WorkflowSteps,
} from "../../components/master-ship/ui";
import {
  createPackingSession,
  fetchEligiblePurchaseOrders,
  fetchPackingSessions,
  markMasterPackCompletedForPos,
  revertMasterPackCompletionForPos,
} from "../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../lib/supabaseError";
import type { PackingSession, PurchaseOrderRow } from "../../types/masterPacking";

const tabBtnBase = "px-4 py-2.5 text-sm font-bold border-b-2 transition";
const poFilterBtnBase = "px-3 py-1.5 rounded-lg text-sm font-semibold border transition";

export default function MasterShipHome() {
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [sessions, setSessions] = useState<PackingSession[]>([]);
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [poFilter, setPoFilter] = useState<"all" | "active" | "completed_po">("all");
  const [moduleTab, setModuleTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState("");
  const [setupHint, setSetupHint] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [poList, sessionList] = await Promise.all([
        fetchEligiblePurchaseOrders(),
        fetchPackingSessions(),
      ]);
      setPos(poList);
      setSessions(sessionList);
    } catch (e: unknown) {
      const msg = getSupabaseErrorMessage(e, "Failed to load data");
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
        setSetupHint(true);
        setError("Database tables not found. Run supabase/migrations/001_master_packing.sql in Supabase first.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedPoIds([]);
  }, [moduleTab, poFilter]);

  useEffect(() => {
    load();
  }, []);

  const togglePo = (id: string) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    if (moduleTab === "ACTIVE" && po.master_pack_status === "completed") return;
    if (moduleTab === "HISTORY" && po.master_pack_status !== "completed") return;
    setSelectedPoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const isCompletedPo = (status: string) => ["Completed", "Partial Fulfillment"].includes(status);
  const isMasterCompleted = (po: PurchaseOrderRow) => po.master_pack_status === "completed";
  const activeMasterPos = pos.filter((po) => !isMasterCompleted(po));
  const historyMasterPos = pos.filter((po) => isMasterCompleted(po));
  const sourcePos = moduleTab === "ACTIVE" ? activeMasterPos : historyMasterPos;

  const filteredPos = sourcePos.filter((po) => {
    if (poFilter === "active") return !isCompletedPo(po.status);
    if (poFilter === "completed_po") return isCompletedPo(po.status);
    return true;
  });

  const handleCreateSession = async () => {
    if (selectedPoIds.length === 0) return;
    const hasCompletedPo = selectedPoIds.some((id) => {
      const po = pos.find((p) => p.id === id);
      return po?.master_pack_status === "completed";
    });
    if (hasCompletedPo) {
      setError("One or more selected POs already completed master packing and cannot be packed again.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const session = await createPackingSession(selectedPoIds);
      window.location.href = `/master-ship/${session.id}`;
    } catch (e: unknown) {
      const msg = getSupabaseErrorMessage(e, "Failed to create session");
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
        setSetupHint(true);
        setError(
          "Master packing tables are missing. Run supabase/migrations/001_master_packing.sql in Supabase SQL editor."
        );
      } else if (msg.includes("42501") || msg.toLowerCase().includes("row-level security")) {
        setSetupHint(true);
        setError(
          `${msg} — Run supabase/migrations/002_master_packing_policies.sql in Supabase to allow writes.`
        );
      } else {
        setError(msg);
      }
      setCreating(false);
    }
  };

  const handleRevertCompletion = async (poIds: string[]) => {
    if (poIds.length === 0) return;

    const hasSession = poIds.some((id) => {
      const po = pos.find((p) => p.id === id);
      return !!po?.master_pack_session_id;
    });

    const ok = window.confirm(
      hasSession
        ? `Revert master packing completion for ${poIds.length} selected PO(s)?\n\nSession-linked POs will reopen their packing session so you can continue scanning. Inner-box-only POs return to the active queue.`
        : `Revert master packing completion for ${poIds.length} selected PO(s)?\n\nThese POs will return to the active master packing queue.`
    );
    if (!ok) return;

    setReverting(true);
    setError("");
    try {
      await revertMasterPackCompletionForPos(poIds);
      setSelectedPoIds([]);
      await load();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to revert master packing completion"));
    } finally {
      setReverting(false);
    }
  };

  const handleBulkMarkCompleted = async () => {
    if (selectedPoIds.length === 0) return;

    const initials = window.prompt("Enter your initials for audit trail (e.g. JH):");
    if (!initials?.trim()) return;

    const ok = window.confirm(
      `Mark ${selectedPoIds.length} selected PO(s) as Master Completed without creating master boxes?\n\nUse this for inner-box-only shipping. This action will lock these POs from future master packing.`
    );
    if (!ok) return;

    setBulkCompleting(true);
    setError("");
    try {
      await markMasterPackCompletedForPos(selectedPoIds, `${initials.trim().toUpperCase()} (INNER-ONLY)`);
      setSelectedPoIds([]);
      await load();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to mark selected POs as completed"));
    } finally {
      setBulkCompleting(false);
    }
  };

  return (
    <MasterShipShell className={selectedPoIds.length > 0 ? "pb-32" : "pb-12"}>
      <BackLink href="/" label="Fulfillment Dashboard" />
      <PageTitle
        title="Master Box Shipping"
        subtitle="Group multiple POs into outbound master cartons. Print master labels, scan inner LPNs into each master, then export a shipment manifest."
      />

      <div className="mb-8">
        <WorkflowSteps
          steps={[
            "Select POs for one shipment",
            "Create & print master box labels",
            "Scan master, then inner LPNs",
            "End packing → print manifest",
          ]}
        />
      </div>

      {error && <AlertBanner variant={setupHint ? "warning" : "error"}>{error}</AlertBanner>}

      <div className="mb-6 flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setModuleTab("ACTIVE")}
          className={`${tabBtnBase} ${
            moduleTab === "ACTIVE"
              ? "border-violet-600 text-violet-700"
              : "border-transparent text-slate-600 hover:text-slate-700"
          }`}
        >
          Active master packing queue ({activeMasterPos.length})
        </button>
        <button
          type="button"
          onClick={() => setModuleTab("HISTORY")}
          className={`${tabBtnBase} ${
            moduleTab === "HISTORY"
              ? "border-violet-600 text-violet-700"
              : "border-transparent text-slate-600 hover:text-slate-700"
          }`}
        >
          Master packing history ({historyMasterPos.length})
        </button>
      </div>

      {moduleTab === "ACTIVE" && sessions.length > 0 && (
        <SectionCard
          title="Resume a session"
          description="Continue packing where you left off."
          icon={Box}
          className="mb-8"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/master-ship/${s.id}`}
                className="group flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-violet-100 bg-violet-50/30 hover:border-violet-400 hover:bg-violet-50 transition"
              >
                <div>
                  <p className="font-bold text-slate-900">Session {s.session_code}</p>
                  <div className="mt-2">
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-violet-600 group-hover:translate-x-0.5 transition" />
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={moduleTab === "ACTIVE" ? "Select purchase orders" : "Master pack completion history"}
        description={
          moduleTab === "ACTIVE"
            ? "Tick every PO that ships together in this batch. Completed master-packed POs are locked."
            : "POs that completed master packing. Select one or more to revert a mistaken completion."
        }
        icon={Package}
      >
        {!loading && pos.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPoFilter("all")}
              className={`${poFilterBtnBase} ${
                poFilter === "all"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              All ({pos.length})
            </button>
            <button
              type="button"
              onClick={() => setPoFilter("active")}
              className={`${poFilterBtnBase} ${
                poFilter === "active"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              Active ({pos.filter((po) => !isCompletedPo(po.status)).length})
            </button>
            <button
              type="button"
              onClick={() => setPoFilter("completed_po")}
              className={`${poFilterBtnBase} ${
                poFilter === "completed_po"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              Completed ({pos.filter((po) => isCompletedPo(po.status)).length})
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-violet-600">
            <Loader2 className="animate-spin w-8 h-8 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Loading eligible POs…</p>
          </div>
        ) : pos.length === 0 ? (
          <EmptyState
            message={moduleTab === "ACTIVE" ? "No purchase orders available" : "No master packed POs yet"}
            hint="Upload POs on the main dashboard first, then return here."
          />
        ) : filteredPos.length === 0 ? (
          <EmptyState
            message="No POs match this filter"
            hint="Try another filter to view more purchase orders."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredPos.map((po) => {
              const selected = selectedPoIds.includes(po.id);
              return (
                <div
                  key={po.id}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    moduleTab === "HISTORY"
                      ? selected
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200 ring-offset-2"
                        : "border-slate-200 bg-slate-50"
                      : po.master_pack_status === "completed"
                      ? "border-slate-200 bg-slate-50"
                      : selected
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200 ring-offset-2"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition ${
                        selected ? "bg-violet-600 border-violet-600" : "bg-white border-slate-300"
                      }`}
                      role="button"
                      tabIndex={
                        (moduleTab === "ACTIVE" && po.master_pack_status !== "completed") ||
                        (moduleTab === "HISTORY" && po.master_pack_status === "completed")
                          ? 0
                          : -1
                      }
                      onClick={() => togglePo(po.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePo(po.id);
                        }
                      }}
                      aria-label={`${selected ? "Unselect" : "Select"} PO ${po.po_number}`}
                    >
                      {selected && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">PO number</p>
                      <p className="font-bold text-slate-900 text-lg leading-tight mt-0.5">{po.po_number}</p>
                      <p className="text-sm text-violet-800 font-semibold mt-1">{po.retailer_name}</p>
                      <div className="mt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={po.status} />
                          <StatusBadge status={po.master_pack_status} />
                        </div>
                        {po.master_pack_status === "completed" && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-emerald-700">
                              Completed by {po.master_pack_completed_by || "Unknown"} on{" "}
                              {po.master_pack_completed_at
                                ? new Date(po.master_pack_completed_at).toLocaleDateString()
                                : "N/A"}
                            </p>
                            {po.master_pack_session_id && (
                              <Link
                                href={`/master-ship/${po.master_pack_session_id}/manifest`}
                                className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold hover:bg-emerald-200 transition"
                              >
                                View manifest #{po.master_pack_session_id.slice(0, 8)}
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {moduleTab === "ACTIVE" && po.master_pack_status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => togglePo(po.id)}
                      className="mt-3 w-full text-sm font-semibold rounded-lg border border-violet-200 text-violet-700 py-1.5 hover:bg-violet-50 transition"
                    >
                      {selected ? "Unselect PO" : "Select PO"}
                    </button>
                  )}
                  {moduleTab === "HISTORY" && po.master_pack_status === "completed" && (
                    <button
                      type="button"
                      onClick={() => handleRevertCompletion([po.id])}
                      disabled={reverting}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg border border-amber-200 text-amber-800 py-1.5 hover:bg-amber-50 transition disabled:opacity-50"
                    >
                      {reverting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      Undo completion
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {selectedPoIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700 text-center sm:text-left">
              <span className="text-violet-700 font-bold text-lg tabular-nums">{selectedPoIds.length}</span>
              {" "}PO{selectedPoIds.length === 1 ? "" : "s"} selected
            </p>
            {moduleTab === "ACTIVE" ? (
              <>
                <BtnPrimary
                  onClick={handleCreateSession}
                  disabled={creating || bulkCompleting || reverting || setupHint}
                  className="w-full sm:w-auto py-3.5 text-base"
                >
                  {creating ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  Start master packing
                </BtnPrimary>
                <button
                  type="button"
                  onClick={handleBulkMarkCompleted}
                  disabled={creating || bulkCompleting || reverting || setupHint}
                  className="w-full sm:w-auto py-3.5 px-4 text-base rounded-xl border-2 border-emerald-200 text-emerald-700 font-bold hover:bg-emerald-50 transition disabled:opacity-50"
                >
                  {bulkCompleting ? "Marking..." : "Mark selected as Inner-box-only completed"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleRevertCompletion(selectedPoIds)}
                disabled={reverting || setupHint}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3.5 px-4 text-base rounded-xl border-2 border-amber-300 text-amber-900 font-bold hover:bg-amber-50 transition disabled:opacity-50"
              >
                {reverting ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <RotateCcw className="w-5 h-5" />
                )}
                Revert selected completions
              </button>
            )}
          </div>
        </div>
      )}
    </MasterShipShell>
  );
}
