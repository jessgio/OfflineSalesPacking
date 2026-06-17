"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../../components/dashboard/primitives";
import { MarketingBiteshipShippingLabel } from "../../../../../components/marketing/MarketingBiteshipShippingLabel";
import { fetchMarketingRequestsByIds } from "../../../../../lib/marketingDb";
import { fetchCarrierWaybillForRequest } from "../../../../../lib/marketingBiteshipLabel";
import { THERMAL_LABEL_HINT, thermalLabelGridClass, thermalLabelPageClass } from "../../../../../lib/thermalLabel";
import { canTrackWithBiteship, type MarketingRequest } from "../../../../../types/marketing";

async function resolveWaybillId(request: MarketingRequest): Promise<string | null> {
  return fetchCarrierWaybillForRequest(request);
}

function BatchBiteshipLabelsContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [waybillById, setWaybillById] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ids.length === 0) {
      setError("No orders selected.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchMarketingRequestsByIds(ids)
      .then(async (data) => {
        if (cancelled) return;

        const eligible = data.filter((request) => canTrackWithBiteship(request));
        if (eligible.length === 0) {
          setError("No selected shipments have been booked with Biteship.");
          return;
        }

        setRequests(eligible);

        const waybills = await Promise.all(
          eligible.map(async (request) => [request.id, await resolveWaybillId(request)] as const)
        );
        if (!cancelled) {
          setWaybillById(Object.fromEntries(waybills));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load labels");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idsParam]);

  if (loading) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600 mb-3" />
        <p className="text-gray-600 text-sm font-medium">
          Preparing {ids.length} carrier label{ids.length === 1 ? "" : "s"}…
        </p>
      </CenteredPage>
    );
  }

  if (error || requests.length === 0) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || "No carrier labels to print"}</p>
          <Link href="/marketing/fulfill">
            <DashButton variant="primary" size="md">
              Back to queue
            </DashButton>
          </Link>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  return (
    <div className={`${thermalLabelPageClass} bg-gray-100`}>
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/marketing/fulfill">
            <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </DashButton>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Batch Biteship carrier labels</h1>
            <p className="text-sm text-gray-600">
              {requests.length} label{requests.length === 1 ? "" : "s"} ready
            </p>
          </div>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md">
          <Printer className="w-4 h-4" /> Print all
        </DashButton>
      </div>

      <p className="print:hidden text-sm text-gray-600 text-center my-6 px-4">{THERMAL_LABEL_HINT}</p>

      <div className={thermalLabelGridClass}>
        {requests.map((request) => (
          <MarketingBiteshipShippingLabel
            key={request.id}
            request={request}
            waybillId={waybillById[request.id]}
          />
        ))}
      </div>
    </div>
  );
}

export default function MarketingBatchBiteshipLabelsPage() {
  return (
    <Suspense
      fallback={
        <CenteredPage>
          <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        </CenteredPage>
      }
    >
      <BatchBiteshipLabelsContent />
    </Suspense>
  );
}
