"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../components/dashboard/primitives";
import { MarketingPackManifest } from "../../../../components/marketing/MarketingPackManifest";
import { fetchMarketingRequestsByIds } from "../../../../lib/marketingDb";
import type { MarketingRequest } from "../../../../types/marketing";

function BatchManifestContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ids.length === 0) {
      setError("No packed orders to show.");
      setLoading(false);
      return;
    }

    fetchMarketingRequestsByIds(ids)
      .then((data) => {
        const packed = data.filter((req) => req.status === "packed" || req.status === "shipped");
        if (packed.length === 0) {
          setError("Selected orders are not packed yet.");
          return;
        }
        setRequests(packed);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load manifest"))
      .finally(() => setLoading(false));
  }, [idsParam]);

  if (loading) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600 mb-3" />
        <p className="text-gray-600 text-sm font-medium">Building packing manifest…</p>
      </CenteredPage>
    );
  }

  if (error || requests.length === 0) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || "No manifest to display"}</p>
          <Link href="/marketing/fulfill">
            <DashButton variant="primary" size="md">Back to queue</DashButton>
          </Link>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-12 print:bg-white">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/marketing/fulfill">
            <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </DashButton>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Packing manifest</h1>
            <p className="text-sm text-gray-600">
              {requests.length} package{requests.length === 1 ? "" : "s"} packed
            </p>
          </div>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md">
          <Printer className="w-4 h-4" /> Print manifest
        </DashButton>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 print:py-0 print:px-0">
        <MarketingPackManifest requests={requests} />
      </div>
    </div>
  );
}

export default function MarketingBatchManifestPage() {
  return (
    <Suspense
      fallback={
        <CenteredPage>
          <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        </CenteredPage>
      }
    >
      <BatchManifestContent />
    </Suspense>
  );
}
