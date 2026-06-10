"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../components/dashboard/primitives";
import { MarketingShippingLabel } from "../../../../components/marketing/MarketingShippingLabel";
import { fetchMarketingRequestById } from "../../../../lib/marketingDb";
import type { MarketingRequest } from "../../../../types/marketing";

export default function MarketingLabelPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [request, setRequest] = useState<MarketingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMarketingRequestById(id)
      .then((data) => {
        if (!data) setError("Request not found.");
        else setRequest(data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600 mb-3" />
        <p className="text-gray-600 text-sm font-medium">Preparing shipping label…</p>
      </CenteredPage>
    );
  }

  if (error || !request) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || "Request not found"}</p>
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
          <h1 className="text-lg font-bold">Marketing label · {request.barcode}</h1>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md">
          <Printer className="w-4 h-4" /> Print label
        </DashButton>
      </div>

      <div className="p-8 flex justify-center print:p-0">
        <MarketingShippingLabel request={request} />
      </div>
    </div>
  );
}
