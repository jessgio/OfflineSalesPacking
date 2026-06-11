"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Loader2, TableProperties } from "lucide-react";
import { SurfaceCard, cx } from "../dashboard/primitives";
import { MarketingSummaryFilterBar } from "./MarketingSummaryFilterBar";
import { downloadMarketingHistoryExport } from "../../lib/marketingExport";
import {
  ALL_FILTER,
  buildPortalFilterOptions,
  defaultSummaryFilters,
  filterRequestsForSummary,
  purposeLabelFromKey,
  type SummaryFilters,
} from "../../lib/marketingPortalFilters";
import type { MarketingRequest, MarketingRequestItem } from "../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function formatSubmitted(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDue(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function lineItemsForRequest(req: MarketingRequest): MarketingRequestItem[] {
  if (req.items?.length) return req.items;
  return [{ product_name: "—", product_barcode: null, qty: 0 }];
}

function totalQty(requests: MarketingRequest[]): number {
  return requests.reduce(
    (sum, req) => sum + (req.items ?? []).reduce((itemSum, item) => itemSum + item.qty, 0),
    0
  );
}

export function MarketingSummaryPanel({
  requests,
  loading,
  onViewRequest,
}: {
  requests: MarketingRequest[];
  loading: boolean;
  onViewRequest: (id: string) => void;
}) {
  const [filters, setFilters] = useState<SummaryFilters>(() => defaultSummaryFilters());

  const filterOptions = useMemo(() => buildPortalFilterOptions(requests), [requests]);

  const filteredRequests = useMemo(
    () => filterRequestsForSummary(requests, filters),
    [requests, filters]
  );

  const lineCount = useMemo(() => {
    return filteredRequests.reduce((sum, req) => sum + lineItemsForRequest(req).length, 0);
  }, [filteredRequests]);

  const totalUnits = useMemo(() => totalQty(filteredRequests), [filteredRequests]);

  const clearFilters = () => setFilters(defaultSummaryFilters());

  const handleExport = () => {
    downloadMarketingHistoryExport(filteredRequests, "marketing-summary-export");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MarketingSummaryFilterBar
        filters={filters}
        filterOptions={filterOptions}
        shipmentCount={filteredRequests.length}
        lineCount={lineCount}
        onFiltersChange={setFilters}
        onClearFilters={clearFilters}
        onExport={handleExport}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SurfaceCard className="p-4 border border-violet-100 bg-violet-50/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Shipments</p>
          <p className="text-3xl font-black tabular-nums text-violet-900 mt-1">{filteredRequests.length}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4 border border-blue-100 bg-blue-50/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Line items</p>
          <p className="text-3xl font-black tabular-nums text-blue-900 mt-1">{lineCount}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4 border border-emerald-100 bg-emerald-50/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total units</p>
          <p className="text-3xl font-black tabular-nums text-emerald-900 mt-1">{totalUnits}</p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
          <TableProperties className="w-4 h-4 text-violet-600" />
          <div>
            <h2 className="font-bold text-gray-900">Item breakdown</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              One row per product line. Shipment details span multiple rows when a request has several items.
            </p>
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <p className="px-5 py-12 text-sm text-gray-500 text-center">
            No shipments match these filters. Try widening division, user, purpose, status, or date range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1180px]">
              <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Barcode</th>
                  <th className="px-3 py-3">Submitted</th>
                  <th className="px-3 py-3">Division</th>
                  <th className="px-3 py-3">Requester</th>
                  <th className="px-3 py-3 min-w-[140px]">Purpose</th>
                  <th className="px-3 py-3">Recipient</th>
                  <th className="px-3 py-3">Courier</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3 min-w-[180px]">Product</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 w-8" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const items = lineItemsForRequest(req);
                  const purposeLabel = purposeLabelFromKey(req.request_purpose?.trim() || "");

                  return items.map((item, itemIndex) => {
                    const isFirstItem = itemIndex === 0;
                    const rowSpan = items.length;

                    return (
                      <tr
                        key={`${req.id}:${itemIndex}`}
                        className={cx(
                          "border-t border-gray-100 hover:bg-gray-50/70",
                          itemIndex > 0 && "bg-gray-50/30"
                        )}
                      >
                        {isFirstItem && (
                          <>
                            <td className="px-3 py-3 align-top" rowSpan={rowSpan}>
                              <span
                                className={cx(
                                  "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap",
                                  statusStyles[req.status] ?? statusStyles.pending
                                )}
                              >
                                {req.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-gray-900" rowSpan={rowSpan}>
                              {req.barcode}
                            </td>
                            <td className="px-3 py-3 align-top text-gray-700 whitespace-nowrap" rowSpan={rowSpan}>
                              {formatSubmitted(req.created_at)}
                            </td>
                            <td className="px-3 py-3 align-top text-gray-800 whitespace-nowrap" rowSpan={rowSpan}>
                              {req.requested_by_division ?? "Other"}
                            </td>
                            <td className="px-3 py-3 align-top" rowSpan={rowSpan}>
                              <p className="font-medium text-gray-900">{req.requested_by_name}</p>
                              <p className="text-xs text-gray-500">{req.requested_by_email}</p>
                            </td>
                            <td
                              className="px-3 py-3 align-top text-violet-800 font-medium max-w-[180px] truncate"
                              rowSpan={rowSpan}
                              title={purposeLabel}
                            >
                              {purposeLabel}
                            </td>
                            <td className="px-3 py-3 align-top" rowSpan={rowSpan}>
                              <p className="font-semibold text-gray-900">{req.recipient_name}</p>
                              <p className="text-xs text-gray-600">
                                {req.city}, {req.country}
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top text-gray-800 whitespace-nowrap" rowSpan={rowSpan}>
                              {req.preferred_courier ?? "—"}
                            </td>
                            <td className="px-3 py-3 align-top text-gray-700 whitespace-nowrap" rowSpan={rowSpan}>
                              {formatDue(req.due_date)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-3 font-medium text-gray-900">{item.product_name}</td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-700">
                          {item.product_barcode || "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-gray-900">{item.qty}</td>
                        {isFirstItem && (
                          <td className="px-3 py-3 align-top" rowSpan={rowSpan}>
                            <button
                              type="button"
                              onClick={() => onViewRequest(req.id)}
                              className="p-1 rounded-lg text-gray-400 hover:text-violet-700 hover:bg-violet-50 transition"
                              aria-label={`View ${req.barcode}`}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
