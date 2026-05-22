"use client";

import { use, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import {
  AlertBanner,
  BarcodeDisplay,
  BtnPrimary,
  EmptyState,
  StatTile,
  StatusBadge,
  TopBar,
} from "../../../../components/master-ship/ui";
import { buildManifest } from "../../../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../../../lib/supabaseError";
import type { ManifestLooseInnerBox, ManifestMasterBox } from "../../../../types/masterPacking";

export default function MasterManifestPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  const [loading, setLoading] = useState(true);
  const [sessionCode, setSessionCode] = useState("");
  const [sessionStatus, setSessionStatus] = useState("");
  const [packedBy, setPackedBy] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [pos, setPos] = useState<{ po_number: string; retailer_name: string }[]>([]);
  const [masterBoxes, setMasterBoxes] = useState<ManifestMasterBox[]>([]);
  const [looseInnerBoxes, setLooseInnerBoxes] = useState<ManifestLooseInnerBox[]>([]);
  const [totals, setTotals] = useState({ masters: 0, inners: 0, assigned: 0, unassigned: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await buildManifest(sessionId);
        setSessionCode(data.session.session_code);
        setSessionStatus(data.session.status);
        setPackedBy(data.session.packed_by);
        setCompletedAt(data.session.completed_at);
        setPos(data.pos);
        setMasterBoxes(data.master_boxes);
        setLooseInnerBoxes(data.loose_inner_boxes);
        setTotals({
          masters: data.total_master_boxes,
          inners: data.total_inner_boxes,
          assigned: data.total_assigned_inner_boxes,
          unassigned: data.total_unassigned_inner_boxes,
        });
      } catch (e: unknown) {
        setError(getSupabaseErrorMessage(e, "Failed to load manifest"));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        <p className="text-sm font-medium text-slate-600">Building manifest…</p>
      </div>
    );
  }

  const completedLabel = completedAt
    ? new Date(completedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Still in progress — end packing on the session page to finalize";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <TopBar
          backHref={`/master-ship/${sessionId}`}
          backLabel="Session"
          title="Shipment manifest"
          badge={<StatusBadge status={sessionStatus} />}
          subtitle={<span className="font-mono font-semibold">Session {sessionCode}</span>}
          actions={
            <BtnPrimary onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> Print
            </BtnPrimary>
          }
        />

        {error && (
          <div className="print:hidden">
            <AlertBanner>{error}</AlertBanner>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:rounded-none">
          <div className="px-6 sm:px-10 py-8 border-b-4 border-slate-900 print:px-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Aeris Beaute</p>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 uppercase tracking-tight">
              Master shipment manifest
            </h1>
            <p className="mt-3 text-lg font-bold text-slate-800">
              Session <span className="font-mono">{sessionCode}</span>
            </p>
            <div className="grid sm:grid-cols-2 gap-6 mt-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Packed by</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{packedBy ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Completed</p>
                <p className="text-base font-semibold text-slate-800 mt-0.5 leading-snug">{completedLabel}</p>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-6 print:px-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Purchase orders</h2>
            <ul className="space-y-2 mb-8">
              {pos.map((po) => (
                <li
                  key={po.po_number}
                  className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-2 border-b border-slate-100 last:border-0"
                >
                  <span className="font-bold text-slate-900">{po.po_number}</span>
                  <span className="text-slate-600 text-sm">{po.retailer_name}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatTile label="Master cartons" value={totals.masters} />
              <StatTile label="Inner in masters" value={totals.assigned} />
              <StatTile label="Loose inners" value={totals.unassigned} />
              <StatTile label="Total inners" value={totals.assigned + totals.unassigned} />
            </div>

            {masterBoxes.length === 0 ? (
              <EmptyState message="No master boxes in this session" />
            ) : (
              <div className="space-y-8">
                {masterBoxes.map((master) => (
                  <article key={master.master_barcode} className="break-inside-avoid">
                    <header className="bg-slate-900 text-white px-4 py-3 rounded-t-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <span className="text-lg font-black">Master #{master.box_number}</span>
                      <BarcodeDisplay value={master.master_barcode} size="sm" inverted />
                    </header>
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-slate-100 border-x border-slate-200 text-sm">
                      <span className="font-semibold text-slate-700">
                        {master.inner_boxes.length} inner carton{master.inner_boxes.length === 1 ? "" : "s"}
                      </span>
                      <StatusBadge status={master.status} />
                    </div>
                    {master.inner_boxes.length === 0 ? (
                      <p className="text-sm text-slate-500 italic px-4 py-4 border border-t-0 border-slate-200 rounded-b-xl">
                        No inner boxes assigned
                      </p>
                    ) : (
                      <div className="overflow-x-auto border border-t-0 border-slate-200 rounded-b-xl">
                        <table className="w-full text-sm min-w-[480px]">
                          <thead>
                            <tr className="bg-slate-50 text-left border-b border-slate-200">
                              <th className="py-3 px-4 font-bold text-slate-700">Inner LPN</th>
                              <th className="py-3 px-4 font-bold text-slate-700">PO</th>
                              <th className="py-3 px-4 font-bold text-slate-700">Product</th>
                              <th className="py-3 px-4 font-bold text-slate-700 w-20">Carton</th>
                            </tr>
                          </thead>
                          <tbody>
                            {master.inner_boxes.map((inner) => (
                              <tr key={inner.inner_barcode} className="border-b border-slate-100 last:border-0">
                                <td className="py-3 px-4">
                                  <span className="font-mono font-bold text-slate-900">{inner.inner_barcode}</span>
                                </td>
                                <td className="py-3 px-4 text-slate-800">{inner.po_number}</td>
                                <td className="py-3 px-4 text-slate-700">{inner.product_name}</td>
                                <td className="py-3 px-4 text-slate-600 tabular-nums">
                                  {inner.carton_number > 0 ? `#${inner.carton_number}` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="mt-10">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                Inner boxes not assigned to any master
              </h3>
              {looseInnerBoxes.length === 0 ? (
                <p className="text-sm text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  All inner boxes are assigned to master cartons.
                </p>
              ) : (
                <div className="overflow-x-auto border border-amber-200 rounded-xl bg-amber-50/40">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="bg-amber-100/60 text-left border-b border-amber-200">
                        <th className="py-3 px-4 font-bold text-amber-900">Inner LPN</th>
                        <th className="py-3 px-4 font-bold text-amber-900">PO</th>
                        <th className="py-3 px-4 font-bold text-amber-900">Product</th>
                        <th className="py-3 px-4 font-bold text-amber-900 w-20">Carton</th>
                      </tr>
                    </thead>
                    <tbody>
                      {looseInnerBoxes.map((inner) => (
                        <tr
                          key={inner.inner_barcode}
                          className="border-b border-amber-100 last:border-0"
                        >
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-slate-900">{inner.inner_barcode}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-800">{inner.po_number}</td>
                          <td className="py-3 px-4 text-slate-700">{inner.product_name}</td>
                          <td className="py-3 px-4 text-slate-600 tabular-nums">
                            {inner.carton_number > 0 ? `#${inner.carton_number}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <footer className="px-6 py-4 border-t border-slate-100 text-center text-xs text-slate-400 print:mt-8">
            Aeris Master Box Shipping
          </footer>
        </div>
      </div>
    </div>
  );
}
