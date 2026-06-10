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

export interface MarketingPurposeStat {
  label: string;
  purposeKey: string;
  requests: number;
  items: number;
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

export function buildMarketingDashboardStats(requests: MarketingRequest[]): MarketingDashboardStats {
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
    byPurpose: [...purposeMap.values()].sort((a, b) => b.requests - a.requests),
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
