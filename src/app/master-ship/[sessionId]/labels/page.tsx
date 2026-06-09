"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Barcode from "react-barcode";
import { Loader2, Printer } from "lucide-react";
import {
  BtnPrimary,
  EmptyState,
  TopBar,
} from "../../../../components/master-ship/ui";
import { fetchMasterBoxes, fetchSession, fetchSessionPos } from "../../../../lib/masterPackingDb";
import type { MasterBox, PackingSession, PurchaseOrderRow } from "../../../../types/masterPacking";

export default function MasterLabelPrinter(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  const [session, setSession] = useState<PackingSession | null>(null);
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [boxes, setBoxes] = useState<MasterBox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, poList, masterList] = await Promise.all([
        fetchSession(sessionId),
        fetchSessionPos(sessionId),
        fetchMasterBoxes(sessionId),
      ]);
      setSession(s);
      setPos(poList);
      setBoxes(masterList);
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 gap-3">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        <p className="text-sm font-medium text-slate-600">Loading labels…</p>
      </div>
    );
  }

  if (boxes.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="max-w-md mx-auto">
          <EmptyState
            message="No master boxes to print"
            hint="Create a master box on the session page first."
          />
          <Link href={`/master-ship/${sessionId}`} className="block mt-6">
            <BtnPrimary className="w-full">Back to session</BtnPrimary>
          </Link>
        </div>
      </div>
    );
  }

  const poSummary = pos.map((p) => p.po_number).join(" · ");

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-black">
      <div className="max-w-5xl mx-auto">
        <TopBar
          backHref={`/master-ship/${sessionId}`}
          backLabel="Session"
          title="Master box labels"
          subtitle={
            <span>
              Session <span className="font-mono font-semibold">{session.session_code}</span> · {boxes.length}{" "}
              label{boxes.length === 1 ? "" : "s"}
            </span>
          }
          actions={
            <BtnPrimary onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> Print all
            </BtnPrimary>
          }
        />

        <p className="print:hidden text-sm text-slate-600 text-center mb-6 px-4">
          Preview below. Use <strong>Print all</strong> for thermal labels — one page per master carton.
        </p>

        <div className="px-4 pb-8 flex flex-wrap gap-6 justify-center print:p-0 print:gap-0">
          {boxes.map((box) => (
            <div
              key={box.id}
              className="bg-white border-2 border-dashed border-violet-200 w-[20rem] p-6 flex flex-col items-center rounded-2xl shadow-sm print:border-none print:w-[100mm] print:h-[150mm] print:break-after-page print:shadow-none print:rounded-none print:justify-start print:pt-12"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Aeris · Master carton</p>
              <h2 className="font-black text-2xl tracking-tight uppercase mt-1 mb-2">Master #{box.box_number}</h2>
              <p className="text-[11px] font-semibold border-b-2 border-black w-full pb-2 mb-3 text-center leading-tight">
                {poSummary}
              </p>
              <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wide mb-4 text-center leading-relaxed">
                Paste on outer box · scan first in packing mode
              </p>
              <Barcode
                value={box.master_barcode}
                format="CODE128"
                width={2.2}
                height={70}
                displayValue
                margin={0}
                fontSize={14}
                background="transparent"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
