"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Truck,
  User,
} from "lucide-react";
import { BiteshipStatusBadge } from "./BiteshipStatusBadge";
import { DashButton, cx } from "../dashboard/primitives";
import type { BiteshipTrackingSnapshot } from "../../lib/biteship";
import { biteshipStatusStyle, formatBiteshipStatusLabel } from "../../lib/biteshipWebhook";
import { canTrackWithBiteship, type MarketingRequest } from "../../types/marketing";

type TrackingResponse = {
  error?: string;
  tracking?: BiteshipTrackingSnapshot;
  cachedStatus?: string | null;
  cachedStatusUpdatedAt?: string | null;
  fetchedAt?: string;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HistoryTimeline({ history }: { history: BiteshipTrackingSnapshot["history"] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic py-4 text-center">
        No scan events yet — check back after the courier picks up the package.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {history.map((entry, index) => {
        const isLatest = index === 0;
        const isLast = index === history.length - 1;

        return (
          <li key={`${entry.updatedAt}-${entry.status}-${index}`} className="relative flex gap-3 pb-5">
            {!isLast && (
              <span
                className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200"
                aria-hidden="true"
              />
            )}
            <span
              className={cx(
                "relative z-10 mt-0.5 w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center",
                isLatest
                  ? "border-violet-500 bg-violet-500 text-white"
                  : "border-gray-300 bg-white text-gray-400"
              )}
              aria-hidden="true"
            >
              <span className={cx("rounded-full", isLatest ? "w-2 h-2 bg-white" : "w-1.5 h-1.5 bg-gray-300")} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className={cx(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                    biteshipStatusStyle(entry.status)
                  )}
                >
                  {formatBiteshipStatusLabel(entry.status)}
                </span>
                {isLatest && (
                  <span className="text-[10px] font-bold uppercase text-violet-600">Latest</span>
                )}
              </div>
              {entry.note && (
                <p className="text-sm text-gray-800 leading-snug">{entry.note}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{formatWhen(entry.updatedAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function BiteshipTrackingPanel({
  request,
  autoRefreshMs = 60_000,
  compact = false,
}: {
  request: MarketingRequest;
  autoRefreshMs?: number;
  compact?: boolean;
}) {
  const trackable = canTrackWithBiteship(request);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState<BiteshipTrackingSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const loadTracking = useCallback(
    async (silent = false) => {
      if (!trackable) return;

      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const res = await fetch(`/api/biteship/tracking?requestId=${encodeURIComponent(request.id)}`);
        const data = (await res.json()) as TrackingResponse;

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load tracking");
        }

        setTracking(data.tracking ?? null);
        setFetchedAt(data.fetchedAt ?? new Date().toISOString());
      } catch (e: unknown) {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Failed to load tracking");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [request.id, trackable]
  );

  useEffect(() => {
    void loadTracking();
  }, [loadTracking]);

  useEffect(() => {
    if (!trackable || !autoRefreshMs) return;

    const timer = setInterval(() => {
      void loadTracking(true);
    }, autoRefreshMs);

    return () => clearInterval(timer);
  }, [autoRefreshMs, loadTracking, trackable]);

  if (!trackable) {
    return null;
  }

  const displayStatus = tracking?.status ?? request.biteship_status;
  const displayUpdatedAt = tracking
    ? tracking.history[0]?.updatedAt ?? request.biteship_status_updated_at
    : request.biteship_status_updated_at;

  return (
    <div
      className={cx(
        "rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/80 to-white overflow-hidden",
        compact ? "text-sm" : ""
      )}
    >
      <div className="px-4 py-3 border-b border-violet-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-violet-600 shrink-0" />
            <h3 className="font-bold text-gray-900">Shipment tracking</h3>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Live updates from Biteship · location scans refresh automatically
          </p>
        </div>
        <DashButton
          type="button"
          variant="subtle"
          size="sm"
          className="shrink-0"
          disabled={loading}
          onClick={() => void loadTracking()}
          title="Refresh tracking"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </DashButton>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <BiteshipStatusBadge status={displayStatus} updatedAt={displayUpdatedAt} />
          {(tracking?.waybillId || request.actual_shipping_label) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Waybill</p>
              <p className="font-mono text-sm font-semibold text-gray-900">
                {tracking?.waybillId ?? request.actual_shipping_label}
              </p>
            </div>
          )}
          {(tracking?.courierCompany || request.biteship_courier_company) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Courier</p>
              <p className="text-sm font-semibold text-gray-900">
                {tracking?.courierCompany ?? request.biteship_courier_company}
                {(tracking?.courierType ?? request.biteship_courier_type)
                  ? ` · ${tracking?.courierType ?? request.biteship_courier_type}`
                  : ""}
              </p>
            </div>
          )}
        </div>

        {tracking?.driverName && (
          <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-white border border-gray-100 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Driver</p>
                <p className="font-semibold text-gray-900">{tracking.driverName}</p>
                {tracking.driverPhone && (
                  <p className="text-xs text-gray-600">{tracking.driverPhone}</p>
                )}
              </div>
            </div>
            {tracking.driverPlateNumber && (
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-500">Plate</p>
                <p className="font-mono font-semibold text-gray-900">{tracking.driverPlateNumber}</p>
              </div>
            )}
          </div>
        )}

        {(tracking?.originAddress || tracking?.destinationAddress) && (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {tracking.originAddress && (
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1 mb-1">
                  <Package className="w-3 h-3" /> Origin
                </p>
                {tracking.originContactName && (
                  <p className="font-semibold text-gray-900">{tracking.originContactName}</p>
                )}
                <p className="text-gray-700 text-xs leading-relaxed mt-0.5">{tracking.originAddress}</p>
              </div>
            )}
            {tracking.destinationAddress && (
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" /> Destination
                </p>
                {tracking.destinationContactName && (
                  <p className="font-semibold text-gray-900">{tracking.destinationContactName}</p>
                )}
                <p className="text-gray-700 text-xs leading-relaxed mt-0.5">{tracking.destinationAddress}</p>
              </div>
            )}
          </div>
        )}

        {(tracking?.trackingLink || request.biteship_waybill_url) && (
          <a
            href={tracking?.trackingLink ?? request.biteship_waybill_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open courier tracking page
          </a>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading && !tracking ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Loading scan history…</span>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Scan history
              </h4>
              {fetchedAt && (
                <span className="text-[10px] text-gray-500">Updated {formatWhen(fetchedAt)}</span>
              )}
            </div>
            <HistoryTimeline history={tracking?.history ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}
