"use client";

import { ChevronRight, X } from "lucide-react";
import { SurfaceCard, cx } from "../dashboard/primitives";
import type { MarketingRequest } from "../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function countItems(req: MarketingRequest): number {
  return (req.items ?? []).reduce((sum, item) => sum + item.qty, 0);
}

export function MarketingDashboardMetricOrders({
  title,
  requests,
  onViewRequest,
  onClose,
}: {
  title: string;
  requests: MarketingRequest[];
  onViewRequest: (id: string) => void;
  onClose: () => void;
}) {
  const totalItems = requests.reduce((sum, req) => sum + countItems(req), 0);

  return (
    <SurfaceCard className="overflow-hidden border-violet-200 ring-2 ring-violet-100">
      <div className="px-5 py-4 border-b border-gray-100 bg-violet-50/60 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {requests.length} shipment{requests.length === 1 ? "" : "s"} · {totalItems} item
            {totalItems === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-white/80 transition"
          aria-label="Close order list"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {requests.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-500 text-center">No orders in this metric.</p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
          {requests.map((req) => (
            <li key={req.id}>
              <button
                type="button"
                onClick={() => onViewRequest(req.id)}
                className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-gray-50/80 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{req.recipient_name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    <span className="font-mono">{req.barcode}</span>
                    {req.request_purpose && (
                      <span className="text-violet-700 font-medium"> · {req.request_purpose}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {req.requested_by_name}
                    {req.requested_by_division ? ` · ${req.requested_by_division}` : ""}
                    {" · "}
                    {countItems(req)} item{countItems(req) === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={cx(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0",
                    statusStyles[req.status] ?? statusStyles.pending
                  )}
                >
                  {req.status}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}
