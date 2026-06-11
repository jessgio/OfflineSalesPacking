import type { MarketingRequest, MarketingRequestStatus, MarketingSession } from "../types/marketing";

export const ALL_FILTER = "__all__";

export interface PortalExportFilters {
  division: string;
  user: string;
  purpose: string;
  status: MarketingRequestStatus | typeof ALL_FILTER;
  dateFrom: string;
  dateTo: string;
}

export type SummaryFilters = PortalExportFilters;

export const SUMMARY_STATUS_OPTIONS: Array<{ value: MarketingRequestStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
];

export function divisionLabel(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "Other";
}

export function purposeKeyFromRequest(req: MarketingRequest): string {
  return req.request_purpose?.trim() || "";
}

export function purposeLabelFromKey(key: string): string {
  return key || "No purpose assigned";
}

export function defaultPortalFilters(session: MarketingSession): PortalExportFilters {
  return {
    division: session.division,
    user: ALL_FILTER,
    purpose: ALL_FILTER,
    status: ALL_FILTER,
    dateFrom: "",
    dateTo: "",
  };
}

export function defaultDashboardFilters(): PortalExportFilters {
  return {
    division: ALL_FILTER,
    user: ALL_FILTER,
    purpose: ALL_FILTER,
    status: ALL_FILTER,
    dateFrom: "",
    dateTo: "",
  };
}

export function defaultSummaryFilters(): SummaryFilters {
  return {
    division: ALL_FILTER,
    user: ALL_FILTER,
    purpose: ALL_FILTER,
    status: ALL_FILTER,
    dateFrom: "",
    dateTo: "",
  };
}

export function buildPortalFilterOptions(requests: MarketingRequest[]) {
  const divisions = new Set<string>();
  const users = new Map<string, string>();
  const purposes = new Map<string, string>();

  for (const req of requests) {
    divisions.add(divisionLabel(req.requested_by_division));
    users.set(req.requested_by_email, req.requested_by_name);
    const key = purposeKeyFromRequest(req);
    purposes.set(key, purposeLabelFromKey(key));
  }

  return {
    divisions: [...divisions].sort((a, b) => a.localeCompare(b)),
    users: [...users.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    purposes: [...purposes.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function startOfFilterDay(value: string): number | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).getTime();
}

function endOfFilterDay(value: string): number | null {
  if (!value) return null;
  return new Date(`${value}T23:59:59.999`).getTime();
}

function matchesPortalDatePurposeAndStatusFilters(
  req: MarketingRequest,
  filters: PortalExportFilters,
  fromTs: number | null,
  toTs: number | null
): boolean {
  if (filters.status !== ALL_FILTER && req.status !== filters.status) {
    return false;
  }
  if (filters.purpose !== ALL_FILTER && purposeKeyFromRequest(req) !== filters.purpose) {
    return false;
  }
  const createdTs = new Date(req.created_at).getTime();
  if (fromTs !== null && createdTs < fromTs) return false;
  if (toTs !== null && createdTs > toTs) return false;
  return true;
}

export function buildPortalShipmentRequests(
  allRequests: MarketingRequest[],
  ownRequests: MarketingRequest[],
  sessionEmail: string
): MarketingRequest[] {
  const normalizedEmail = sessionEmail.trim().toLowerCase();
  const byId = new Map<string, MarketingRequest>();

  for (const req of ownRequests) {
    if (req.status !== "cancelled") {
      byId.set(req.id, req);
    }
  }

  for (const req of allRequests) {
    if (req.status === "cancelled") continue;
    const isOwn = req.requested_by_email.trim().toLowerCase() === normalizedEmail;
    if (isOwn) {
      byId.set(req.id, req);
      continue;
    }
    if (req.status === "pending" || req.status === "packed") {
      byId.set(req.id, req);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function filterRequestsForPortal(
  requests: MarketingRequest[],
  filters: PortalExportFilters
): MarketingRequest[] {
  const fromTs = startOfFilterDay(filters.dateFrom);
  const toTs = endOfFilterDay(filters.dateTo);

  return requests.filter((req) => {
    if (filters.division !== ALL_FILTER && divisionLabel(req.requested_by_division) !== filters.division) {
      return false;
    }
    if (filters.user !== ALL_FILTER && req.requested_by_email !== filters.user) {
      return false;
    }
    return matchesPortalDatePurposeAndStatusFilters(req, filters, fromTs, toTs);
  });
}

/** Shipments tab: always keep the signed-in user's requests; division filter only applies to others. */
export function filterPortalShipmentRequests(
  requests: MarketingRequest[],
  filters: PortalExportFilters,
  sessionEmail: string
): MarketingRequest[] {
  const fromTs = startOfFilterDay(filters.dateFrom);
  const toTs = endOfFilterDay(filters.dateTo);
  const normalizedEmail = sessionEmail.trim().toLowerCase();

  return requests.filter((req) => {
    const isOwn = req.requested_by_email.trim().toLowerCase() === normalizedEmail;

    if (filters.user !== ALL_FILTER && req.requested_by_email !== filters.user) {
      return false;
    }
    if (!matchesPortalDatePurposeAndStatusFilters(req, filters, fromTs, toTs)) {
      return false;
    }
    if (isOwn) {
      return true;
    }
    if (filters.division !== ALL_FILTER && divisionLabel(req.requested_by_division) !== filters.division) {
      return false;
    }
    return true;
  });
}

export function hasActivePortalFilters(filters: PortalExportFilters): boolean {
  return (
    filters.division !== ALL_FILTER ||
    filters.user !== ALL_FILTER ||
    filters.purpose !== ALL_FILTER ||
    filters.status !== ALL_FILTER ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo)
  );
}

export function filterRequestsForSummary(
  requests: MarketingRequest[],
  filters: SummaryFilters
): MarketingRequest[] {
  return filterRequestsForPortal(requests, filters);
}

export function hasActiveSummaryFilters(filters: SummaryFilters): boolean {
  return hasActivePortalFilters(filters);
}
