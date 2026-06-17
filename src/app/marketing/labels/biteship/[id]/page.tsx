"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../../components/dashboard/primitives";
import { MarketingBiteshipShippingLabel } from "../../../../../components/marketing/MarketingBiteshipShippingLabel";
import { fetchCarrierWaybillForRequest } from "../../../../../lib/marketingBiteshipLabel";
import { fetchMarketingRequestById } from "../../../../../lib/marketingDb";
import { THERMAL_LABEL_HINT, thermalLabelGridClass, thermalLabelPageClass } from "../../../../../lib/thermalLabel";
import { canTrackWithBiteship, type MarketingRequest } from "../../../../../types/marketing";

export default function MarketingBiteshipLabelPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [request, setRequest] = useState<MarketingRequest | null>(null);
  const [waybillId, setWaybillId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchMarketingRequestById(id)
      .then(async (data) => {
        if (cancelled) return;
        if (!data) {
          setError("Request not found.");
          return;
        }
        if (!canTrackWithBiteship(data)) {
          setError("This shipment has not been booked with Biteship yet.");
          setRequest(data);
          return;
        }

        setRequest(data);
        setWaybillId(await fetchCarrierWaybillForRequest(data));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600 mb-3" />
        <p className="text-gray-600 text-sm font-medium">Preparing carrier label…</p>
      </CenteredPage>
    );
  }

  if (error || !request) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || "Request not found"}</p>
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
            <h1 className="text-lg font-bold">Biteship carrier label · {request.barcode}</h1>
            <p className="text-sm text-gray-600">
              {formatCourierSubtitle(request)}
              {!waybillId && !request.actual_shipping_label ? " · AWB pending" : ""}
            </p>
          </div>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md">
          <Printer className="w-4 h-4" /> Print label
        </DashButton>
      </div>

      <p className="print:hidden text-sm text-gray-600 text-center my-6 px-4">{THERMAL_LABEL_HINT}</p>

      <div className={thermalLabelGridClass}>
        <MarketingBiteshipShippingLabel request={request} waybillId={waybillId} />
      </div>
    </div>
  );
}

function formatCourierSubtitle(request: MarketingRequest): string {
  const company = request.biteship_courier_company?.trim();
  const type = request.biteship_courier_type?.trim();
  if (company && type) return `${company.toUpperCase()} · ${type.toUpperCase()}`;
  if (company) return company.toUpperCase();
  return "Carrier shipment";
}
