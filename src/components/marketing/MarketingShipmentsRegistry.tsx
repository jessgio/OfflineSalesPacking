"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { DashButton, SurfaceCard, cx, fieldInput } from "../dashboard/primitives";
import { updateMarketingActualShippingLabel } from "../../lib/marketingDb";
import {
  courierNeedsActualShippingLabel,
  type MarketingRequest,
  type MarketingSession,
} from "../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDue(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value + "T12:00:00").toLocaleDateString();
}

export function MarketingShipmentsRegistry({
  requests,
  session,
  onViewRequest,
  onUpdated,
  variant = "fulfill",
  live = false,
}: {
  requests: MarketingRequest[];
  session: MarketingSession | null;
  onViewRequest: (id: string) => void;
  onUpdated: () => void;
  variant?: "fulfill" | "portal";
  live?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const req of requests) {
      next[req.id] = req.actual_shipping_label ?? "";
    }
    setDrafts(next);
  }, [requests]);

  const isAdmin = session?.role === "admin";

  const handleSaveLabel = async (req: MarketingRequest) => {
    if (!session || !isAdmin) return;
    const draft = drafts[req.id] ?? "";
    if (draft === (req.actual_shipping_label ?? "")) return;

    setSavingId(req.id);
    setRowError((prev) => ({ ...prev, [req.id]: "" }));
    try {
      await updateMarketingActualShippingLabel(session, req.id, draft);
      onUpdated();
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [req.id]: e instanceof Error ? e.message : "Failed to save",
      }));
    } finally {
      setSavingId(null);
    }
  };

  const isPortal = variant === "portal";

  if (requests.length === 0) {
    return (
      <SurfaceCard className="p-12 text-center">
        <p className="text-gray-600 font-medium">
          {isPortal ? "No shipments yet." : "No marketing shipments yet."}
        </p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">
              {isPortal ? "My shipments" : "Shipment registry"}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isPortal ? (
                <>
                  Track status and carrier labels for your requests.{" "}
                  <span className="font-semibold">Regular</span> and{" "}
                  <span className="font-semibold">Kargo</span> orders show the tracking reference once
                  dispatch is recorded.
                </>
              ) : (
                <>
                  All ongoing and completed orders. For <span className="font-semibold">Regular</span> and{" "}
                  <span className="font-semibold">Kargo</span> shipments, record the carrier tracking or
                  label reference after dispatch.
                </>
              )}
            </p>
          </div>
          {live && (
            <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              Live
            </span>
          )}
        </div>
        {!isPortal && !isAdmin && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Sign in as fulfillment admin above to enter or edit actual shipping labels.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Barcode</th>
              <th className="px-3 py-3">Recipient</th>
              <th className="px-3 py-3">Courier</th>
              <th className="px-3 py-3">Due</th>
              <th className="px-3 py-3">Purpose</th>
              <th className="px-3 py-3 text-right">Items</th>
              <th className="px-3 py-3">Shipped</th>
              <th className="px-3 py-3 min-w-[220px]">Actual shipping label</th>
              <th className="px-3 py-3 w-8" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => {
              const needsLabel = courierNeedsActualShippingLabel(req.preferred_courier);
              const draft = drafts[req.id] ?? "";
              const isDirty = draft !== (req.actual_shipping_label ?? "");
              const isSaving = savingId === req.id;

              return (
                <tr
                  key={req.id}
                  className="border-t border-gray-100 hover:bg-gray-50/80 group"
                >
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onViewRequest(req.id)}
                      className="text-left"
                    >
                      <span
                        className={cx(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap",
                          statusStyles[req.status] ?? statusStyles.pending
                        )}
                      >
                        {req.status}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onViewRequest(req.id)}
                      className="font-mono text-xs font-semibold text-gray-900 hover:text-violet-700"
                    >
                      {req.barcode}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onViewRequest(req.id)}
                      className="text-left"
                    >
                      <p className="font-semibold text-gray-900">{req.recipient_name}</p>
                      <p className="text-xs text-gray-600">
                        {req.city}, {req.country}
                      </p>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-gray-800 whitespace-nowrap">
                    {req.preferred_courier ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{formatDue(req.due_date)}</td>
                  <td className="px-3 py-3 max-w-[140px]">
                    <p className="text-xs text-violet-800 font-medium truncate" title={req.request_purpose ?? undefined}>
                      {req.request_purpose ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900 tabular-nums">
                    {req.items?.length ?? 0}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {req.shipped_at ? (
                      <>
                        <span className="font-semibold text-gray-800">{req.shipped_by ?? "—"}</span>
                        <br />
                        {formatWhen(req.shipped_at)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {!needsLabel ? (
                      <span className="text-xs text-gray-500 italic">N/A ({req.preferred_courier ?? "—"})</span>
                    ) : isAdmin ? (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <input
                            value={draft}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            placeholder="Tracking / label ref"
                            className={`${fieldInput} text-xs font-mono py-1.5 flex-1 min-w-0`}
                          />
                          <DashButton
                            type="button"
                            variant={isDirty ? "primary" : "subtle"}
                            size="sm"
                            className="shrink-0 px-2"
                            disabled={!isDirty || isSaving}
                            onClick={() => handleSaveLabel(req)}
                            title="Save shipping label"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </DashButton>
                        </div>
                        {req.actual_shipping_label_at && !isDirty && (
                          <p className="text-[10px] text-gray-500">
                            {req.actual_shipping_label_by} · {formatWhen(req.actual_shipping_label_at)}
                          </p>
                        )}
                        {rowError[req.id] && (
                          <p className="text-[10px] text-red-600">{rowError[req.id]}</p>
                        )}
                      </div>
                    ) : req.actual_shipping_label ? (
                      <div>
                        <p className="font-mono text-xs font-semibold text-gray-900">{req.actual_shipping_label}</p>
                        {req.actual_shipping_label_at && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {req.actual_shipping_label_by} · {formatWhen(req.actual_shipping_label_at)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onViewRequest(req.id)}
                      className="text-gray-400 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition"
                      aria-label="View details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}
