"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Printer } from "lucide-react";
import { MasterManifestBoxLabel } from "../../../../components/master-ship/MasterManifestBoxLabel";
import {
  AlertBanner,
  BtnPrimary,
  BtnSecondary,
  EmptyState,
  TopBar,
} from "../../../../components/master-ship/ui";
import { buildManifest } from "../../../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../../../lib/supabaseError";
import { THERMAL_LABEL_HINT, thermalLabelGridClass, thermalLabelPageClass } from "../../../../lib/thermalLabel";
import type { ManifestMasterBox } from "../../../../types/masterPacking";

export default function MasterManifestLabelsPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(props.params);
  const [loading, setLoading] = useState(true);
  const [sessionCode, setSessionCode] = useState("");
  const [pos, setPos] = useState<{ po_number: string; retailer_name: string }[]>([]);
  const [masterBoxes, setMasterBoxes] = useState<ManifestMasterBox[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await buildManifest(sessionId);
        setSessionCode(data.session.session_code);
        setPos(data.pos);
        setMasterBoxes(data.master_boxes);
      } catch (e: unknown) {
        setError(getSupabaseErrorMessage(e, "Failed to load manifest labels"));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        <p className="text-sm font-medium text-slate-600">Preparing box labels…</p>
      </div>
    );
  }

  const poSummary = pos.map((p) => p.po_number).join(" · ");
  const retailerName = pos.length === 1 ? pos[0].retailer_name : undefined;

  if (masterBoxes.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="max-w-md mx-auto">
          <EmptyState
            message="No master boxes to label"
            hint="Assign inner cartons to master boxes before printing manifest labels."
          />
          <Link href={`/master-ship/${sessionId}/manifest`} className="block mt-6">
            <BtnSecondary className="w-full">Back to manifest</BtnSecondary>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${thermalLabelPageClass} bg-slate-100`}>
      <div className="max-w-5xl mx-auto">
        <TopBar
          backHref={`/master-ship/${sessionId}/manifest`}
          backLabel="Manifest"
          title="Manifest box labels"
          subtitle={
            <span>
              Session <span className="font-mono font-semibold">{sessionCode}</span> · {masterBoxes.length} label
              {masterBoxes.length === 1 ? "" : "s"} — one per master carton with contents
            </span>
          }
          actions={
            <BtnPrimary onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> Print all labels
            </BtnPrimary>
          }
        />

        {error && (
          <div className="print:hidden px-4 mb-4">
            <AlertBanner>{error}</AlertBanner>
          </div>
        )}

        <p className="print:hidden text-sm text-slate-600 text-center mb-6 px-4 max-w-xl mx-auto leading-relaxed">
          {THERMAL_LABEL_HINT}
        </p>

        <div className={thermalLabelGridClass}>
          {masterBoxes.map((master) => (
            <MasterManifestBoxLabel
              key={master.master_barcode}
              master={master}
              sessionCode={sessionCode}
              poSummary={poSummary}
              retailerName={retailerName}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
