"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { MarketingPortalExportBar } from "./MarketingPortalExportBar";
import { MarketingPurposeSummary } from "./MarketingPurposeSummary";
import { MarketingShipmentsRegistry } from "./MarketingShipmentsRegistry";
import {
  ALL_FILTER,
  buildPortalFilterOptions,
  defaultPortalFilters,
  filterPortalShipmentRequests,
  type PortalExportFilters,
} from "../../lib/marketingPortalFilters";
import { downloadMarketingHistoryExport } from "../../lib/marketingExport";
import type { MarketingRequest, MarketingSession } from "../../types/marketing";

function groupRequestsByPurpose(requests: MarketingRequest[]) {
  const groups = new Map<string, MarketingRequest[]>();
  for (const req of requests) {
    const key = req.request_purpose?.trim() || "";
    const list = groups.get(key) ?? [];
    list.push(req);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    })
    .map(([purposeKey, list]) => ({
      purposeKey,
      label: purposeKey || "No purpose assigned",
      requests: list,
    }));
}

export function MarketingPortalShipmentsPanel({
  requests,
  loading,
  session,
  onViewRequest,
  onUpdated,
}: {
  requests: MarketingRequest[];
  loading: boolean;
  session: MarketingSession;
  onViewRequest: (id: string) => void;
  onUpdated: () => void;
}) {
  const [filters, setFilters] = useState<PortalExportFilters>(() => defaultPortalFilters(session));
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (filtersInitialized) return;
    setFilters(defaultPortalFilters(session));
    setFiltersInitialized(true);
  }, [session, filtersInitialized]);

  const filterOptions = useMemo(() => buildPortalFilterOptions(requests), [requests]);

  const filteredRequests = useMemo(
    () => filterPortalShipmentRequests(requests, filters, session.email),
    [requests, filters, session.email]
  );

  const shipmentsByPurpose = useMemo(
    () => groupRequestsByPurpose(filteredRequests),
    [filteredRequests]
  );

  useEffect(() => {
    setSelectedIds([]);
  }, [filters]);

  const allVisibleSelected =
    filteredRequests.length > 0 && selectedIds.length === filteredRequests.length;

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedIds(allVisibleSelected ? [] : filteredRequests.map((req) => req.id));
  };

  const handleExport = () => {
    const toExport =
      selectedIds.length > 0
        ? filteredRequests.filter((req) => selectedIds.includes(req.id))
        : filteredRequests;
    downloadMarketingHistoryExport(toExport);
  };

  const clearFilters = () => {
    setFilters({
      division: ALL_FILTER,
      user: ALL_FILTER,
      purpose: ALL_FILTER,
      status: ALL_FILTER,
      dateFrom: "",
      dateTo: "",
    });
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
      <MarketingPortalExportBar
        filters={filters}
        filterOptions={filterOptions}
        filteredCount={filteredRequests.length}
        selectedCount={selectedIds.length}
        onFiltersChange={setFilters}
        onClearFilters={clearFilters}
        onExport={handleExport}
      />

      {filteredRequests.length > 0 && (
        <MarketingPurposeSummary groups={shipmentsByPurpose} totalLabel="Filtered shipments" />
      )}

      <MarketingShipmentsRegistry
        requests={filteredRequests}
        session={session}
        onViewRequest={onViewRequest}
        onUpdated={onUpdated}
        variant="portal"
        live
        selectable
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allVisibleSelected={allVisibleSelected}
      />
    </div>
  );
}
