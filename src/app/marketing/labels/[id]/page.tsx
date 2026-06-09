"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Barcode from "react-barcode";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard } from "../../../../components/dashboard/primitives";
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

  const addressLines = [
    request.recipient_name,
    request.recipient_phone,
    request.address_line1,
    request.address_line2,
    `${request.city}, ${request.state} ${request.postal_code}`,
    request.country,
  ].filter(Boolean);

  const dueLabel = request.due_date
    ? new Date(request.due_date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

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
        <div className="bg-white border-2 border-dashed border-gray-300 w-[100mm] min-h-[150mm] p-5 flex flex-col rounded-xl shadow-sm print:border-none print:shadow-none print:rounded-none print:w-[100mm] print:min-h-[150mm] print:break-after-page">
          <div className="border-b-2 border-black pb-2 mb-3">
            <h2 className="font-black text-xl tracking-tighter uppercase">AERIS BEAUTE</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Marketing shipment</p>
            {(request.preferred_courier || dueLabel) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {request.preferred_courier && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 border-2 border-black">
                    {request.preferred_courier}
                  </span>
                )}
                {dueLabel && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-black text-white">
                    Due {dueLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">Ship to</p>
            {addressLines.map((line, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-base font-black leading-tight"
                    : i === 1 && request.recipient_phone
                      ? "text-sm font-bold leading-snug"
                      : "text-sm font-semibold leading-snug"
                }
              >
                {line}
              </p>
            ))}
          </div>

          <div className="border-y-2 border-black py-2 mb-3 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-2">Pack these items</p>
            <ul className="space-y-1">
              {(request.items ?? []).map((item) => (
                <li key={item.id ?? `${item.product_name}-${item.qty}`} className="text-sm font-bold leading-tight">
                  <span className="inline-block w-8">{item.qty}×</span>
                  {item.product_name}
                </li>
              ))}
            </ul>
          </div>

          {request.notes && (
            <p className="text-[10px] bg-gray-100 border border-gray-200 rounded px-2 py-1.5 mb-3 font-medium">
              Note: {request.notes}
            </p>
          )}

          <div className="mt-auto flex flex-col items-center pt-2">
            <Barcode
              value={request.barcode}
              format="CODE128"
              width={1.8}
              height={50}
              displayValue
              margin={0}
              fontSize={14}
              background="transparent"
            />
            <p className="text-[9px] text-gray-600 mt-2 uppercase font-bold tracking-widest text-center">
              Scan when packed · paste on package
            </p>
            <p className="text-[8px] text-gray-600 mt-1">
              Req by {request.requested_by_name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
