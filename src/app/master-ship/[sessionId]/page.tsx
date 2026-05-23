"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Box,
  Loader2,
  PackageCheck,
  Printer,
  ScanLine,
  Plus,
  FileText,
  Trash2,
} from "lucide-react";
import {
  AlertBanner,
  BarcodeDisplay,
  BtnDanger,
  BtnPrimary,
  BtnSecondary,
  EmptyState,
  SectionCard,
  StatTile,
  StatusBadge,
  TopBar,
  WorkflowSteps,
} from "../../../components/master-ship/ui";
import {
  completePackingSession,
  createMasterBox,
  deleteMasterBox,
  deletePackingSession,
  fetchMasterBoxes,
  fetchSessionInnerCoverage,
  fetchSession,
  fetchSessionPos,
  reopenMasterBox,
  sealMasterBox,
} from "../../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../../lib/supabaseError";
import type { MasterBox, PackingSession, PurchaseOrderRow } from "../../../types/masterPacking";

export default function MasterShipSession(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  const [session, setSession] = useState<PackingSession | null>(null);
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [masterBoxes, setMasterBoxes] = useState<MasterBox[]>([]);
  const [innerCoverage, setInnerCoverage] = useState({
    total_inner_boxes: 0,
    assigned_inner_boxes: 0,
    loose_inner_boxes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const [s, poList, boxes] = await Promise.all([
        fetchSession(sessionId),
        fetchSessionPos(sessionId),
        fetchMasterBoxes(sessionId),
      ]);
      const coverage = await fetchSessionInnerCoverage(sessionId);
      setSession(s);
      setPos(poList);
      setMasterBoxes(boxes);
      setInnerCoverage(coverage);
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Load failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [sessionId]);

  const handleNewMasterBox = async () => {
    if (!session || session.status === "completed") return;
    setBusy(true);
    setError("");
    try {
      await createMasterBox(session);
      await reload();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Could not create master box"));
    } finally {
      setBusy(false);
    }
  };

  const handleSeal = async (boxId: string) => {
    setBusy(true);
    try {
      await sealMasterBox(boxId);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMasterBox = async (box: MasterBox) => {
    const ok = window.confirm(
      `Delete master #${box.box_number} (${box.master_barcode})?\n\nAll inner cartons assigned to this master will be unlinked. You can re-scan them in packing mode.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await deleteMasterBox(box.id);
      await reload();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to delete master box"));
    } finally {
      setBusy(false);
    }
  };

  const handleReopenMaster = async (boxId: string) => {
    setBusy(true);
    try {
      await reopenMasterBox(boxId);
      await reload();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to reopen master box"));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSession = async () => {
    const ok = window.confirm(
      `Delete this entire packing session (${session?.session_code})?\n\nAll master boxes and scan assignments will be removed. POs and inner LPN labels are not affected.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deletePackingSession(sessionId);
      window.location.href = "/master-ship";
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to delete session"));
      setBusy(false);
    }
  };

  const handleEndPacking = async () => {
    if (!session) return;
    const name = window.prompt("Enter packer initials for manifest:");
    if (!name?.trim()) return;
    const ok = window.confirm(
      "End packing for this session? All open master boxes will be sealed and the manifest will be finalized."
    );
    if (!ok) return;
    setBusy(true);
    try {
      await completePackingSession(sessionId, name.trim().toUpperCase());
      window.location.href = `/master-ship/${sessionId}/manifest`;
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, "Failed to complete session"));
      setBusy(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        <p className="text-sm font-medium text-slate-600">Loading session…</p>
      </div>
    );
  }

  const isCompleted = session.status === "completed";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <TopBar
          backHref="/master-ship"
          backLabel="Master shipping home"
          title={`Session ${session.session_code}`}
          badge={<StatusBadge status={session.status} />}
          subtitle={
            <span>
              {pos.length} purchase order{pos.length === 1 ? "" : "s"} · {masterBoxes.length} master
              {masterBoxes.length === 1 ? "" : "s"}
            </span>
          }
          actions={
            <>
              {!isCompleted && (
                <>
                  <Link href={`/master-ship/${sessionId}/pack`}>
                    <BtnPrimary className="bg-slate-900 hover:bg-slate-800">
                      <ScanLine className="w-4 h-4" /> Packing mode
                    </BtnPrimary>
                  </Link>
                  {masterBoxes.length > 0 && (
                    <Link href={`/master-ship/${sessionId}/labels`}>
                      <BtnSecondary>
                        <Printer className="w-4 h-4" /> Labels
                      </BtnSecondary>
                    </Link>
                  )}
                </>
              )}
              <Link href={`/master-ship/${sessionId}/manifest`}>
                <BtnSecondary>
                  <FileText className="w-4 h-4" /> Manifest
                </BtnSecondary>
              </Link>
            </>
          }
        />

        {error && <AlertBanner>{error}</AlertBanner>}

        {!isCompleted && (
          <div className="mb-6">
            <WorkflowSteps
              steps={[
                "New master box + print label",
                "Packing mode: scan master → inners",
                "Seal when carton is full",
                "End packing for manifest",
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatTile label="POs" value={pos.length} />
          <StatTile label="Master boxes" value={masterBoxes.length} />
          <StatTile
            label="Open masters"
            value={masterBoxes.filter((b) => b.status === "open").length}
          />
        </div>

        <SectionCard title="Purchase orders in this shipment" className="mb-6">
          <ul className="divide-y divide-slate-100">
            {pos.map((po) => (
              <li key={po.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">PO</p>
                  <p className="font-bold text-slate-900">{po.po_number}</p>
                </div>
                <p className="text-sm text-slate-600 sm:text-right">{po.retailer_name}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Master cartons"
          description="Each physical outbound box gets its own master barcode. Inner LPNs are assigned in packing mode."
          icon={Box}
          className="mb-6"
          action={
            !isCompleted ? (
              <BtnPrimary onClick={handleNewMasterBox} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                New master
              </BtnPrimary>
            ) : undefined
          }
        >
          {masterBoxes.length === 0 ? (
            <EmptyState
              message="No master boxes yet"
              hint='Click "New master" to generate a barcode label, then open Packing mode.'
            />
          ) : (
            <ul className="space-y-3">
              {masterBoxes.map((box) => (
                <li
                  key={box.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border-2 border-slate-100 bg-slate-50/50 border-l-4 border-l-violet-500"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xl font-bold text-slate-900">Master #{box.box_number}</span>
                      <StatusBadge status={box.status} />
                    </div>
                    <BarcodeDisplay value={box.master_barcode} size="sm" />
                  </div>
                  {!isCompleted && (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {box.status === "open" ? (
                        <BtnSecondary onClick={() => handleSeal(box.id)} disabled={busy} className="text-sm py-2">
                          Seal
                        </BtnSecondary>
                      ) : (
                        <BtnSecondary
                          onClick={() => handleReopenMaster(box.id)}
                          disabled={busy}
                          className="text-sm py-2 border-amber-200 text-amber-900"
                        >
                          Reopen
                        </BtnSecondary>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMasterBox(box)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-red-700 border-2 border-red-200 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!isCompleted && masterBoxes.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Inner coverage:{" "}
                <span className="text-violet-700">
                  Assigned {innerCoverage.assigned_inner_boxes} / {innerCoverage.total_inner_boxes}
                </span>
                {innerCoverage.loose_inner_boxes > 0 && (
                  <span className="text-amber-700"> ({innerCoverage.loose_inner_boxes} loose)</span>
                )}
              </p>
              <BtnPrimary
                onClick={handleEndPacking}
                disabled={busy}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <PackageCheck className="w-5 h-5" /> End packing & open manifest
              </BtnPrimary>
            </div>
          )}
        </SectionCard>

        {!isCompleted && (
          <section className="rounded-2xl border-2 border-red-100 bg-red-50/60 p-5 sm:p-6">
            <h3 className="font-bold text-red-950 text-base">Start over?</h3>
            <p className="mt-1 text-sm text-red-800 leading-relaxed max-w-xl">
              Wrong master sizes or need a full redo? Delete this session. Your POs and inner LPN labels stay
              unchanged.
            </p>
            <BtnDanger onClick={handleDeleteSession} disabled={busy} className="mt-4">
              <Trash2 className="w-4 h-4" /> Delete entire session
            </BtnDanger>
          </section>
        )}
      </div>
    </div>
  );
}
