"use client";

import { Download, Filter } from "lucide-react";
import { DashButton, SurfaceCard, fieldInput } from "../dashboard/primitives";
import {
  ALL_FILTER,
  SUMMARY_STATUS_OPTIONS,
  type SummaryFilters,
  hasActiveSummaryFilters,
} from "../../lib/marketingPortalFilters";

export function MarketingSummaryFilterBar({
  filters,
  filterOptions,
  shipmentCount,
  lineCount,
  onFiltersChange,
  onClearFilters,
  onExport,
}: {
  filters: SummaryFilters;
  filterOptions: {
    divisions: string[];
    users: Array<{ email: string; name: string }>;
    purposes: Array<{ key: string; label: string }>;
  };
  shipmentCount: number;
  lineCount: number;
  onFiltersChange: (filters: SummaryFilters) => void;
  onClearFilters: () => void;
  onExport: () => void;
}) {
  const activeFilters = hasActiveSummaryFilters(filters);

  return (
    <SurfaceCard className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-violet-700">
        <Filter className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wide">Filter summary</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Division</label>
          <select
            value={filters.division}
            onChange={(e) => onFiltersChange({ ...filters, division: e.target.value })}
            className={fieldInput}
          >
            <option value={ALL_FILTER}>All divisions</option>
            {filterOptions.divisions.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">User</label>
          <select
            value={filters.user}
            onChange={(e) => onFiltersChange({ ...filters, user: e.target.value })}
            className={fieldInput}
          >
            <option value={ALL_FILTER}>All users</option>
            {filterOptions.users.map((user) => (
              <option key={user.email} value={user.email}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Purpose</label>
          <select
            value={filters.purpose}
            onChange={(e) => onFiltersChange({ ...filters, purpose: e.target.value })}
            className={fieldInput}
          >
            <option value={ALL_FILTER}>All purposes</option>
            {filterOptions.purposes.map((purpose) => (
              <option key={purpose.key || "__none__"} value={purpose.key}>
                {purpose.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                status: e.target.value as SummaryFilters["status"],
              })
            }
            className={fieldInput}
          >
            <option value={ALL_FILTER}>All statuses</option>
            {SUMMARY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">From date</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className={fieldInput}
          />
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">To date</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className={fieldInput}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-600">
          {shipmentCount} shipment{shipmentCount === 1 ? "" : "s"} · {lineCount} line item
          {lineCount === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {activeFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-bold text-violet-700 hover:text-violet-900"
            >
              Clear filters
            </button>
          )}
          <DashButton
            type="button"
            variant="primary"
            size="md"
            disabled={lineCount === 0}
            onClick={onExport}
            className="shrink-0"
          >
            <Download className="w-4 h-4" />
            Export CSV ({lineCount})
          </DashButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
