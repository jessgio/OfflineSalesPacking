"use client";

import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Loader2,
  Package,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { SurfaceCard, cx } from "../dashboard/primitives";
import {
  buildMarketingDashboardStats,
  formatDelta,
  type MarketingActivityEvent,
  type MarketingTrendBucket,
} from "../../lib/marketingAnalytics";
import type { MarketingRequest } from "../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const activityLabels: Record<MarketingActivityEvent["type"], string> = {
  created: "Request submitted",
  packed: "Packed by offline team",
  shipped: "Marked shipped",
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  sub,
  accent = "violet",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "violet" | "blue" | "green" | "amber";
}) {
  const accentClasses = {
    violet: "text-violet-700 bg-violet-50 border-violet-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-green-700 bg-green-50 border-green-100",
    amber: "text-amber-800 bg-amber-50 border-amber-100",
  };

  return (
    <SurfaceCard className={cx("p-4 border", accentClasses[accent])}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-3xl font-black tabular-nums mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs font-medium mt-2 opacity-90">{sub}</p>}
    </SurfaceCard>
  );
}

function TrendBars({
  title,
  buckets,
  emptyMessage,
}: {
  title: string;
  buckets: MarketingTrendBucket[];
  emptyMessage: string;
}) {
  const maxRequests = Math.max(...buckets.map((b) => b.requests), 1);
  const maxItems = Math.max(...buckets.map((b) => b.items), 1);
  const hasData = buckets.some((b) => b.requests > 0 || b.items > 0);

  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-violet-600" />
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      {!hasData ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <>
          <div className="flex items-end gap-2 h-36 mb-3">
            {buckets.map((bucket) => (
              <div key={bucket.start} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full flex items-end justify-center gap-0.5 h-28">
                  <div
                    className="w-[42%] rounded-t bg-violet-500/90 min-h-[2px]"
                    style={{ height: `${Math.max(4, (bucket.requests / maxRequests) * 100)}%` }}
                    title={`${bucket.requests} request${bucket.requests === 1 ? "" : "s"}`}
                  />
                  <div
                    className="w-[42%] rounded-t bg-emerald-500/85 min-h-[2px]"
                    style={{ height: `${Math.max(4, (bucket.items / maxItems) * 100)}%` }}
                    title={`${bucket.items} item${bucket.items === 1 ? "" : "s"}`}
                  />
                </div>
                <span className="text-[10px] font-semibold text-gray-500 truncate w-full text-center">
                  {bucket.label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> Requests
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Items
            </span>
          </div>
        </>
      )}
    </SurfaceCard>
  );
}

export function MarketingDashboard({
  requests,
  loading,
  onViewRequest,
}: {
  requests: MarketingRequest[];
  loading: boolean;
  onViewRequest: (id: string) => void;
}) {
  const stats = useMemo(() => buildMarketingDashboardStats(requests), [requests]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <SurfaceCard className="p-12 text-center">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-800">No activity yet</p>
        <p className="text-sm text-gray-600 mt-2">
          Submit your first request to see usage stats and trends here.
        </p>
      </SurfaceCard>
    );
  }

  const { totals, periods, byPurpose, byCourier, weeklyTrend, monthlyTrend, topProducts, recentActivity } =
    stats;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All-time shipments" value={totals.requests} sub={`${totals.items} items ordered`} />
        <StatCard
          label="Avg items / shipment"
          value={totals.avgItemsPerRequest}
          accent="blue"
        />
        <StatCard
          label="This week"
          value={periods.thisWeek.requests}
          sub={`${periods.thisWeek.items} items · ${formatDelta(periods.thisWeek.requests, periods.lastWeek.requests)} vs last week`}
          accent="green"
        />
        <StatCard
          label="This month"
          value={periods.thisMonth.requests}
          sub={`${periods.thisMonth.items} items · ${formatDelta(periods.thisMonth.requests, periods.lastMonth.requests)} vs last month`}
          accent="amber"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Pending", totals.pending, "amber"],
            ["Packed", totals.packed, "blue"],
            ["Shipped", totals.shipped, "green"],
            ["Cancelled", totals.cancelled, "violet"],
          ] as const
        ).map(([label, count, accent]) => (
          <SurfaceCard key={label} className="p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
            <p
              className={cx(
                "text-2xl font-black tabular-nums mt-1",
                accent === "amber" && "text-amber-700",
                accent === "blue" && "text-blue-700",
                accent === "green" && "text-green-700",
                accent === "violet" && "text-violet-700"
              )}
            >
              {count}
            </p>
          </SurfaceCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrendBars
          title="Requests & items by week"
          buckets={weeklyTrend}
          emptyMessage="No weekly data yet."
        />
        <TrendBars
          title="Requests & items by month"
          buckets={monthlyTrend}
          emptyMessage="No monthly data yet."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SurfaceCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-violet-600" />
            <h3 className="font-bold text-gray-900">By purpose</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2 pr-3">Purpose</th>
                  <th className="pb-2 pr-3 text-right">Shipments</th>
                  <th className="pb-2 text-right">Items</th>
                </tr>
              </thead>
              <tbody>
                {byPurpose.map((row) => (
                  <tr key={row.purposeKey || "__none__"} className="border-t border-gray-100">
                    <td className="py-2.5 pr-3 font-medium text-violet-900 max-w-[220px] truncate" title={row.label}>
                      {row.label}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-bold tabular-nums">{row.requests}</td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-gray-700">{row.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="w-4 h-4 text-violet-600" />
            <h3 className="font-bold text-gray-900">Top products ordered</h3>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-500">No product lines yet.</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((product, index) => (
                <li
                  key={product.name}
                  className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs font-black text-gray-400 w-5 tabular-nums">{index + 1}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black tabular-nums text-gray-900">{product.qty}×</p>
                    <p className="text-[10px] text-gray-500">{product.requestCount} shipment(s)</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SurfaceCard className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-violet-600" />
            <h3 className="font-bold text-gray-900">Recent activity</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentActivity.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onViewRequest(event.requestId)}
                  className="w-full flex items-start gap-3 py-3 text-left hover:bg-gray-50/80 rounded-lg px-1 -mx-1 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {activityLabels[event.type]} · {event.recipientName}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {event.barcode}
                      {event.purpose && (
                        <span className="text-violet-700 font-medium"> · {event.purpose}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">{formatWhen(event.at)}</p>
                  </div>
                  <span
                    className={cx(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0",
                      statusStyles[event.status] ?? statusStyles.pending
                    )}
                  >
                    {event.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                </button>
              </li>
            ))}
          </ul>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-violet-600" />
            <h3 className="font-bold text-gray-900">Courier mix</h3>
          </div>
          <ul className="space-y-3">
            {byCourier.map((row) => {
              const pct = totals.requests > 0 ? Math.round((row.requests / totals.requests) * 100) : 0;
              return (
                <li key={row.courier}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-gray-800">{row.courier}</span>
                    <span className="tabular-nums text-gray-600">
                      {row.requests} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2 text-xs text-gray-600">
            <p>
              <span className="font-bold text-gray-800">Last week:</span>{" "}
              {periods.lastWeek.requests} shipments, {periods.lastWeek.items} items
            </p>
            <p>
              <span className="font-bold text-gray-800">Last month:</span>{" "}
              {periods.lastMonth.requests} shipments, {periods.lastMonth.items} items
            </p>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
