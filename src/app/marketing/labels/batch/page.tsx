"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../components/dashboard/primitives";
import { MarketingShippingLabel } from "../../../../components/marketing/MarketingShippingLabel";
import { fetchMarketingRequestsByIds } from "../../../../lib/marketingDb";
import type { MarketingRequest } from "../../../../types/marketing";

function BatchLabelsContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ids.length === 0) {
      setError("No orders selected.");
      setLoading(false);
      return;
    }

    fetchMarketingRequestsByIds(ids)
      .then((data) => {
        if (data.length === 0) setError("No matching requests found.");
        else setRequests(data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load labels"))
      .finally(() => setLoading(false));
  }, [idsParam]);

  if (loading) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600 mb-3" />
        <p className="text-gray-600 text-sm font-medium">Preparing {ids.length} label{ids.length === 1 ? "" : "s"}…</p>
      </CenteredPage>
    );
  }

  if (error || requests.length === 0) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || "No labels to print"}</p>
          <Link href="/marketing/fulfill">
            <DashButton variant="primary" size="md">Back to queue</DashButton>
          </Link>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24 text-black">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/marketing/fulfill">
            <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </DashButton>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Batch marketing labels</h1>
            <p className="text-sm text-gray-600">
              {requests.length} label{requests.length === 1 ? "" : "s"} ready
            </p>
          </div>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md">
          <Printer className="w-4 h-4" /> Print all
        </DashButton>
      </div>

      <p className="print:hidden text-sm text-gray-600 text-center my-6 px-4">
        Preview below. Use <strong>Print all</strong> for thermal labels — one page per package.
      </p>

      <div className="p-8 flex flex-wrap gap-8 justify-center print:p-0 print:gap-0">
        {requests.map((request) => (
          <MarketingShippingLabel key={request.id} request={request} />
        ))}
      </div>
    </div>
  );
}

export default function MarketingBatchLabelsPage() {
  return (
    <Suspense
      fallback={
        <CenteredPage>
          <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        </CenteredPage>
      }
    >
      <BatchLabelsContent />
    </Suspense>
  );
}
