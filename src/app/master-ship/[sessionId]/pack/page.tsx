"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ScanLine, Trash2, Undo2 } from "lucide-react";
import {
  AlertBanner,
  BarcodeDisplay,
  BtnPrimary,
  BtnSecondary,
  StatusBadge,
  TopBar,
} from "../../../../components/master-ship/ui";
import { isMasterBarcode } from "../../../../lib/masterBoxBarcode";
import {
  assignInnerToMaster,
  deleteMasterBox,
  fetchMasterBoxContents,
  fetchMasterBoxes,
  fetchSession,
  fetchSessionPos,
  findInnerAssignment,
  findInnerBoxInSession,
  findMasterBoxInSession,
  removeInnerFromMaster,
  reopenMasterBox,
  sealMasterBox,
} from "../../../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../../../lib/supabaseError";
import type { MasterBox, MasterBoxContentRow, PackingSession, PurchaseOrderRow } from "../../../../types/masterPacking";

const rowActionBtnBase =
  "shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50";

export default function MasterPackStation(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  const [session, setSession] = useState<PackingSession | null>(null);
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [masterBoxes, setMasterBoxes] = useState<MasterBox[]>([]);
  const [activeMaster, setActiveMaster] = useState<MasterBox | null>(null);
  const [activeContents, setActiveContents] = useState<MasterBoxContentRow[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [feedback, setFeedback] = useState({
    title: "Ready to scan",
    detail: "Scan a master box barcode (MB…) to activate that carton.",
    type: "default" as "default" | "success" | "error",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadContents = useCallback(async (masterId: string | null) => {
    if (!masterId) {
      setActiveContents([]);
      return;
    }
    setActiveContents(await fetchMasterBoxContents(masterId));
  }, []);

  const reload = useCallback(async () => {
    const [s, poList, boxes] = await Promise.all([
      fetchSession(sessionId),
      fetchSessionPos(sessionId),
      fetchMasterBoxes(sessionId),
    ]);
    setSession(s);
    setPos(poList);
    setMasterBoxes(boxes);
    if (activeMaster) {
      const updated = boxes.find((b) => b.id === activeMaster.id);
      if (updated) {
        setActiveMaster(updated);
        await loadContents(updated.id);
      } else {
        setActiveMaster(null);
        setActiveContents([]);
      }
    }
  }, [sessionId, activeMaster, loadContents]);

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const focus = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("button") && t.closest("[data-no-refocus]")) return;
      inputRef.current?.focus();
    };
    document.addEventListener("click", focus);
    inputRef.current?.focus();
    return () => document.removeEventListener("click", focus);
  }, []);

  const setScanFeedback = (
    type: "default" | "success" | "error",
    title: string,
    detail: string
  ) => setFeedback({ type, title, detail });

  const playSound = (type: "success" | "error" | "stage") => {
    try {
      const ctx = new (window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === "stage") {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      /* optional */
    }
  };

  const activateMaster = async (master: MasterBox) => {
    if (master.status === "sealed") {
      const reopen = window.confirm(
        `Master #${master.box_number} is sealed. Reopen it to add or remove inner cartons?`
      );
      if (!reopen) return;
      await reopenMasterBox(master.id);
      master = { ...master, status: "open" };
      await reload();
    }
    playSound("stage");
    setActiveMaster(master);
    await loadContents(master.id);
    setScanFeedback(
      "success",
      `Master #${master.box_number} active`,
      "Scan inner LPN barcodes to add. Scan the same LPN again to undo."
    );
  };

  const handleRemoveInner = async (content: MasterBoxContentRow) => {
    if (!activeMaster || session?.status === "completed") return;
    setBusy(true);
    try {
      await removeInnerFromMaster(content.id);
      playSound("stage");
      await loadContents(activeMaster.id);
      setScanFeedback("success", "Inner removed", `${content.inner_barcode} is no longer in this master.`);
    } catch (e: unknown) {
      playSound("error");
      setScanFeedback("error", "Remove failed", getSupabaseErrorMessage(e, "Could not remove inner box"));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const handleDeleteActiveMaster = async () => {
    if (!activeMaster || session?.status === "completed") return;
    const ok = window.confirm(
      `Delete master #${activeMaster.box_number} and clear all ${activeContents.length} inner assignment(s)?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMasterBox(activeMaster.id);
      playSound("stage");
      setActiveMaster(null);
      setActiveContents([]);
      setScanFeedback("default", "Master deleted", "Scan a new master box barcode to continue.");
      await reload();
    } catch (e: unknown) {
      playSound("error");
      setScanFeedback("error", "Delete failed", getSupabaseErrorMessage(e, "Could not delete master box"));
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim().toUpperCase();
    setScanInput("");
    if (!code || !session) return;

    if (session.status === "completed") {
      playSound("error");
      setScanFeedback("error", "Session locked", "This session is completed. View the manifest.");
      return;
    }

    if (isMasterBarcode(code)) {
      const master = await findMasterBoxInSession(sessionId, code);
      if (!master) {
        playSound("error");
        setScanFeedback("error", "Unknown master", "This barcode does not belong to this session.");
        return;
      }
      await activateMaster(master);
      return;
    }

    if (!activeMaster) {
      playSound("error");
      setScanFeedback("error", "No master selected", "Scan a master box barcode (starts with MB) first.");
      return;
    }

    const inner = await findInnerBoxInSession(sessionId, code);
    if (!inner) {
      playSound("error");
      setScanFeedback(
        "error",
        "Invalid inner LPN",
        "This barcode is not an inner box for the POs in this session."
      );
      return;
    }

    const assignment = await findInnerAssignment(inner.id);
    if (assignment) {
      if (assignment.master_box_id === activeMaster.id) {
        setBusy(true);
        try {
          await removeInnerFromMaster(assignment.id);
          playSound("stage");
          await loadContents(activeMaster.id);
          setScanFeedback("success", "Scan undone", `${code} removed from master #${activeMaster.box_number}.`);
        } catch (err: unknown) {
          playSound("error");
          setScanFeedback("error", "Undo failed", getSupabaseErrorMessage(err, "Could not remove"));
        } finally {
          setBusy(false);
        }
        return;
      }
      playSound("error");
      setScanFeedback(
        "error",
        "Already packed elsewhere",
        "This inner box is in another master. Remove it there first."
      );
      return;
    }

    try {
      await assignInnerToMaster(activeMaster, inner);
      playSound("success");
      await loadContents(activeMaster.id);
      setScanFeedback(
        "success",
        "Inner added",
        `${code} → Master #${activeMaster.box_number} · ${inner.product_name}`
      );
    } catch (err: unknown) {
      playSound("error");
      setScanFeedback("error", "Add failed", getSupabaseErrorMessage(err, "Could not assign inner box"));
    }
  };

  const handleSealAndNext = async () => {
    if (!activeMaster) return;
    await sealMasterBox(activeMaster.id);
    playSound("stage");
    setActiveMaster(null);
    setActiveContents([]);
    setScanFeedback("default", "Master sealed", "Scan the next master box barcode when ready.");
    await reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 gap-3">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        <p className="text-sm font-medium text-slate-600">Loading packing station…</p>
      </div>
    );
  }

  const feedbackStyles = {
    default: "bg-sky-600 text-white border-sky-700",
    success: "bg-emerald-600 text-white border-emerald-700",
    error: "bg-red-600 text-white border-red-700",
  };

  const canEdit = session?.status !== "completed";

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col print:hidden">
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
        <TopBar
          backHref={`/master-ship/${sessionId}`}
          backLabel="Session"
          title="Packing mode"
          badge={session ? <StatusBadge status={session.status} /> : undefined}
          subtitle={
            <span className="font-mono font-semibold text-slate-800">Session {session?.session_code}</span>
          }
        />

        <div className={`mx-4 sm:mx-0 rounded-2xl border-2 px-5 py-5 ${feedbackStyles[feedback.type]}`}>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">Scanner status</p>
          <p className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">{feedback.title}</p>
          <p className="mt-2 text-sm sm:text-base opacity-95 leading-relaxed">{feedback.detail}</p>
        </div>

        <div className="flex-1 px-4 sm:px-0 py-6 space-y-5 pb-32">
          <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-violet-900">Active master carton</p>
              {activeMaster && <StatusBadge status={activeMaster.status} />}
            </div>
            <div className="p-6 text-center">
              {activeMaster ? (
                <>
                  <p className="text-5xl font-black text-slate-900 tabular-nums">#{activeMaster.box_number}</p>
                  <div className="mt-3">
                    <BarcodeDisplay value={activeMaster.master_barcode} size="md" />
                  </div>
                  <p className="mt-4 text-lg font-bold text-violet-700">
                    {activeContents.length} inner carton{activeContents.length === 1 ? "" : "s"} inside
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-slate-600 py-4">No master selected</p>
              )}
            </div>
          </div>

          <form onSubmit={handleScan}>
            <label htmlFor="scan-input" className="block text-sm font-bold text-slate-700 mb-2">
              Barcode scanner
            </label>
            <input
              id="scan-input"
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              disabled={!canEdit || busy}
              className="w-full text-center text-xl sm:text-2xl font-mono text-gray-900 p-4 sm:p-5 border-2 border-violet-400 rounded-2xl bg-white focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:opacity-50 shadow-inner"
              placeholder="Waiting for scan…"
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-slate-600 text-center">
              Master labels start with <span className="font-mono font-bold">MB</span> · Inner labels are numeric LPNs
            </p>
          </form>

          {activeMaster && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-no-refocus>
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-slate-600" />
                <p className="text-sm font-bold text-slate-800">Contents of master #{activeMaster.box_number}</p>
              </div>
              {activeContents.length === 0 ? (
                <p className="text-center text-slate-600 py-8 text-sm">No inner cartons scanned yet</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {activeContents.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <BarcodeDisplay value={c.inner_barcode} size="sm" />
                        <p className="text-sm text-slate-600 mt-1 truncate">
                          {c.product_name}
                        </p>
                        <p className="text-xs text-slate-600">{c.po_number}</p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInner(c)}
                          disabled={busy}
                          data-no-refocus
                          className={`${rowActionBtnBase} text-red-700 bg-red-50 hover:bg-red-100`}
                        >
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <details className="bg-white/80 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <summary className="font-bold text-slate-800 cursor-pointer">All masters in session ({masterBoxes.length})</summary>
            <ul className="mt-3 space-y-2 font-mono text-xs">
              {masterBoxes.map((b) => (
                <li
                  key={b.id}
                  className={`p-2 rounded-lg ${b.id === activeMaster?.id ? "bg-violet-100 text-violet-900 font-bold" : "text-slate-600"}`}
                >
                  #{b.box_number} · {b.master_barcode} · {b.status}
                </li>
              ))}
            </ul>
          </details>
        </div>

        {canEdit && (
          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-lg">
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              {activeMaster && (
                <BtnPrimary
                  onClick={handleSealAndNext}
                  disabled={busy}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800"
                >
                  Seal master #{activeMaster.box_number} & scan next
                </BtnPrimary>
              )}
              {activeMaster && (
                <button
                  type="button"
                  onClick={handleDeleteActiveMaster}
                  disabled={busy}
                  data-no-refocus
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-red-700 border-2 border-red-200 bg-white hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete this master box
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
