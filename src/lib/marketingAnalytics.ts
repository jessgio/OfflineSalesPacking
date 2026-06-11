import type { MarketingRequest, MarketingRequestStatus } from "../types/marketing";

export type MarketingActivityType = "created" | "packed" | "shipped";

export interface MarketingActivityEvent {
  id: string;
  requestId: string;
  barcode: string;
  recipientName: string;
  purpose: string | null;
  type: MarketingActivityType;
  at: string;
  status: MarketingRequestStatus;
}

export interface MarketingPeriodCount {
  requests: number;
  items: number;
}

export interface MarketingTrendBucket {
  label: string;
  start: string;
  requests: number;
  items: number;
}

export interface MarketingPurposeRequesterStat {
  name: string;
  email: string;
  requests: number;
  items: number;
}

export interface MarketingPurposeDivisionStat {
  division: string;
  requests: number;
  items: number;
}

export interface MarketingPurposeStat {
  label: string;
  purposeKey: string;
  requests: number;
  items: number;
  byRequester?: MarketingPurposeRequesterStat[];
  byDivision?: MarketingPurposeDivisionStat[];
}

export interface MarketingProductStat {
  name: string;
  qty: number;
  requestCount: number;
}

export interface MarketingDashboardStats {
  totals: {
    requests: number;
    items: number;
    avgItemsPerRequest: number;
    pending: number;
    packed: number;
    shipped: number;
    cancelled: number;
  };
  periods: {
    thisWeek: MarketingPeriodCount;
    lastWeek: MarketingPeriodCount;
    thisMonth: MarketingPeriodCount;
    lastMonth: MarketingPeriodCount;
  };
  byPurpose: MarketingPurposeStat[];
  byCourier: Array<{ courier: string; requests: number }>;
  weeklyTrend: MarketingTrendBucket[];
  monthlyTrend: MarketingTrendBucket[];
  topProducts: MarketingProductStat[];
  recentActivity: MarketingActivityEvent[];
}

function countItems(req: MarketingRequest): number {
  return (req.items ?? []).reduce((sum, item) => sum + item.qty, 0);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  day.setDate(day.getDate() + diff);
  return day;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function sumPeriod(requests: MarketingRequest[], start: Date, end: Date): MarketingPeriodCount {
  let requestCount = 0;
  let items = 0;
  for (const req of requests) {
    if (inRange(req.created_at, start, end)) {
      requestCount++;
      items += countItems(req);
    }
  }
  return { requests: requestCount, items };
}

function formatWeekLabel(start: Date): string {
  return start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthLabel(start: Date): string {
  return start.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function purposeLabel(purpose: string | null | undefined): string {
  const trimmed = purpose?.trim();
  return trimmed || "No purpose assigned";
}

function purposeKeyFromRequest(req: MarketingRequest): string {
  return req.request_purpose?.trim() || "";
}

function divisionLabelFromRequest(req: MarketingRequest): string {
  const trimmed = req.requested_by_division?.trim();
  return trimmed || "Other";
}

function attachRequesterBreakdown(
  requests: MarketingRequest[],
  purposeStats: MarketingPurposeStat[]
): MarketingPurposeStat[] {
  const requestsByPurpose = new Map<string, MarketingRequest[]>();
  for (const req of requests) {
    const key = purposeKeyFromRequest(req);
    const list = requestsByPurpose.get(key) ?? [];
    list.push(req);
    requestsByPurpose.set(key, list);
  }

  return purposeStats.map((stat) => {
    const purposeRequests = requestsByPurpose.get(stat.purposeKey) ?? [];
    const requesterMap = new Map<string, MarketingPurposeRequesterStat>();

    for (const req of purposeRequests) {
      const email = req.requested_by_email;
      const entry = requesterMap.get(email) ?? {
        name: req.requested_by_name,
        email,
        requests: 0,
        items: 0,
      };
      entry.requests++;
      entry.items += countItems(req);
      requesterMap.set(email, entry);
    }

    const byRequester = [...requesterMap.values()].sort(
      (a, b) => b.requests - a.requests || a.name.localeCompare(b.name)
    );

    return byRequester.length > 0 ? { ...stat, byRequester } : stat;
  });
}

function attachDivisionBreakdown(
  requests: MarketingRequest[],
  purposeStats: MarketingPurposeStat[]
): MarketingPurposeStat[] {
  const requestsByPurpose = new Map<string, MarketingRequest[]>();
  for (const req of requests) {
    const key = purposeKeyFromRequest(req);
    const list = requestsByPurpose.get(key) ?? [];
    list.push(req);
    requestsByPurpose.set(key, list);
  }

  return purposeStats.map((stat) => {
    const purposeRequests = requestsByPurpose.get(stat.purposeKey) ?? [];
    const divisionMap = new Map<string, MarketingPurposeDivisionStat>();

    for (const req of purposeRequests) {
      const division = divisionLabelFromRequest(req);
      const entry = divisionMap.get(division) ?? {
        division,
        requests: 0,
        items: 0,
      };
      entry.requests++;
      entry.items += countItems(req);
      divisionMap.set(division, entry);
    }

    const byDivision = [...divisionMap.values()].sort(
      (a, b) => b.requests - a.requests || a.division.localeCompare(b.division)
    );

    return byDivision.length > 0 ? { ...stat, byDivision } : stat;
  });
}

export function buildMarketingDashboardStats(
  requests: MarketingRequest[],
  options?: {
    includeRequesterBreakdown?: boolean;
    includeDivisionBreakdown?: boolean;
  }
): MarketingDashboardStats {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const nextWeekStart = addDays(weekStart, 7);
  const lastWeekStart = addDays(weekStart, -7);
  const monthStart = startOfMonth(now);
  const nextMonthStart = addMonths(monthStart, 1);
  const lastMonthStart = addMonths(monthStart, -1);

  let totalItems = 0;
  const statusCounts = { pending: 0, packed: 0, shipped: 0, cancelled: 0 };
  const purposeMap = new Map<string, MarketingPurposeStat>();
  const courierMap = new Map<string, number>();
  const productMap = new Map<string, { qty: number; requestIds: Set<string> }>();
  const activity: MarketingActivityEvent[] = [];

  for (const req of requests) {
    const items = countItems(req);
    totalItems += items;
    statusCounts[req.status]++;

    const purposeKey = req.request_purpose?.trim() || "";
    const purposeStat = purposeMap.get(purposeKey) ?? {
      label: purposeLabel(req.request_purpose),
      purposeKey,
      requests: 0,
      items: 0,
    };
    purposeStat.requests++;
    purposeStat.items += items;
    purposeMap.set(purposeKey, purposeStat);

    const courier = req.preferred_courier ?? "Unknown";
    courierMap.set(courier, (courierMap.get(courier) ?? 0) + 1);

    for (const item of req.items ?? []) {
      const key = item.product_name.trim();
      if (!key) continue;
      const entry = productMap.get(key) ?? { qty: 0, requestIds: new Set<string>() };
      entry.qty += item.qty;
      entry.requestIds.add(req.id);
      productMap.set(key, entry);
    }

    activity.push({
      id: `${req.id}:created`,
      requestId: req.id,
      barcode: req.barcode,
      recipientName: req.recipient_name,
      purpose: req.request_purpose,
      type: "created",
      at: req.created_at,
      status: req.status,
    });

    if (req.packed_at) {
      activity.push({
        id: `${req.id}:packed`,
        requestId: req.id,
        barcode: req.barcode,
        recipientName: req.recipient_name,
        purpose: req.request_purpose,
        type: "packed",
        at: req.packed_at,
        status: req.status,
      });
    }

    if (req.shipped_at) {
      activity.push({
        id: `${req.id}:shipped`,
        requestId: req.id,
        barcode: req.barcode,
        recipientName: req.recipient_name,
        purpose: req.request_purpose,
        type: "shipped",
        at: req.shipped_at,
        status: req.status,
      });
    }
  }

  const weeklyTrend: MarketingTrendBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(weekStart, -7 * i);
    const end = addDays(start, 7);
    const bucket = sumPeriod(requests, start, end);
    weeklyTrend.push({
      label: formatWeekLabel(start),
      start: start.toISOString(),
      ...bucket,
    });
  }

  const monthlyTrend: MarketingTrendBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = addMonths(monthStart, -i);
    const end = addMonths(start, 1);
    const bucket = sumPeriod(requests, start, end);
    monthlyTrend.push({
      label: formatMonthLabel(start),
      start: start.toISOString(),
      ...bucket,
    });
  }

  const requestCount = requests.length;
  const byPurposeBase = [...purposeMap.values()].sort((a, b) => b.requests - a.requests);
  let byPurpose = byPurposeBase;
  if (options?.includeDivisionBreakdown) {
    byPurpose = attachDivisionBreakdown(requests, byPurpose);
  } else if (options?.includeRequesterBreakdown) {
    byPurpose = attachRequesterBreakdown(requests, byPurpose);
  }

  return {
    totals: {
      requests: requestCount,
      items: totalItems,
      avgItemsPerRequest: requestCount > 0 ? Math.round((totalItems / requestCount) * 10) / 10 : 0,
      ...statusCounts,
    },
    periods: {
      thisWeek: sumPeriod(requests, weekStart, nextWeekStart),
      lastWeek: sumPeriod(requests, lastWeekStart, weekStart),
      thisMonth: sumPeriod(requests, monthStart, nextMonthStart),
      lastMonth: sumPeriod(requests, lastMonthStart, monthStart),
    },
    byPurpose,
    byCourier: [...courierMap.entries()]
      .map(([courier, count]) => ({ courier, requests: count }))
      .sort((a, b) => b.requests - a.requests),
    weeklyTrend,
    monthlyTrend,
    topProducts: [...productMap.entries()]
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        requestCount: data.requestIds.size,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8),
    recentActivity: activity
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 20),
  };
}

export function formatDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "—" : "+100%";
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export type DashboardMetricKey =
  | "all"
  | "avg-items"
  | "this-week"
  | "this-month"
  | "pending"
  | "packed"
  | "shipped"
  | "cancelled";

export const DASHBOARD_METRIC_LABELS: Record<DashboardMetricKey, string> = {
  all: "All-time shipments",
  "avg-items": "All shipments",
  "this-week": "This week",
  "this-month": "This month",
  pending: "Pending",
  packed: "Packed",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

export function filterRequestsForDashboardMetric(
  requests: MarketingRequest[],
  metric: DashboardMetricKey
): MarketingRequest[] {
  if (metric === "pending" || metric === "packed" || metric === "shipped" || metric === "cancelled") {
    return requests.filter((req) => req.status === metric);
  }
  if (metric === "all" || metric === "avg-items") {
    return requests;
  }

  const now = new Date();
  const weekStart = startOfWeek(now);
  const nextWeekStart = addDays(weekStart, 7);
  const monthStart = startOfMonth(now);
  const nextMonthStart = addMonths(monthStart, 1);

  if (metric === "this-week") {
    return requests.filter((req) => inRange(req.created_at, weekStart, nextWeekStart));
  }
  if (metric === "this-month") {
    return requests.filter((req) => inRange(req.created_at, monthStart, nextMonthStart));
  }

  return requests;
}
