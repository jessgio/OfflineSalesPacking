"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { DashButton, SurfaceCard, cx, fieldInput } from "../dashboard/primitives";
import {
  updateMarketingActualShippingLabel,
  updateMarketingRequestPurpose,
} from "../../lib/marketingDb";
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

type RegistryField = "purpose" | "label";

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

function cellErrorKey(requestId: string, field: RegistryField): string {
  return `${requestId}:${field}`;
}

function RegistryInlineField({
  draft,
  savedValue,
  placeholder,
  canEdit,
  isSaving,
  isDirty,
  error,
  mono = false,
  savedMeta,
  onDraftChange,
  onSave,
}: {
  draft: string;
  savedValue: string;
  placeholder: string;
  canEdit: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error?: string;
  mono?: boolean;
  savedMeta?: ReactNode;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  if (!canEdit) {
    if (!savedValue) {
      return <span className="text-xs text-gray-400">—</span>;
    }
    return (
      <div>
        <p
          className={cx(
            "text-xs text-gray-900",
            mono ? "font-mono font-semibold" : "font-medium text-violet-800"
          )}
        >
          {savedValue}
        </p>
        {savedMeta}
      </div>
    );
  }

  return (
    <div className="space-y-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder}
          className={cx(fieldInput, "text-xs py-1.5 flex-1 min-w-0", mono && "font-mono")}
        />
        <DashButton
          type="button"
          variant={isDirty ? "primary" : "subtle"}
          size="sm"
          className="shrink-0 px-2"
          disabled={!isDirty || isSaving}
          onClick={onSave}
          title="Save"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </DashButton>
      </div>
      {savedMeta && !isDirty && savedMeta}
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
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
  const [purposeDrafts, setPurposeDrafts] = useState<Record<string, string>>({});
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<{ id: string; field: RegistryField } | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextPurpose: Record<string, string> = {};
    const nextLabel: Record<string, string> = {};
    for (const req of requests) {
      nextPurpose[req.id] = req.request_purpose ?? "";
      nextLabel[req.id] = req.actual_shipping_label ?? "";
    }
    setPurposeDrafts(nextPurpose);
    setLabelDrafts(nextLabel);
  }, [requests]);

  const isAdmin = session?.role === "admin";
  const isPortal = variant === "portal";

  const canEditPurpose = (req: MarketingRequest) =>
    !!session && (isAdmin || req.requested_by_email === session.email);

  const canEditLabel = (req: MarketingRequest) =>
    !!session &&
    courierNeedsActualShippingLabel(req.preferred_courier) &&
    (isAdmin || req.requested_by_email === session.email);

  const handleSavePurpose = async (req: MarketingRequest) => {
    if (!session || !canEditPurpose(req)) return;
    const draft = purposeDrafts[req.id] ?? "";
    if (draft === (req.request_purpose ?? "")) return;

    const field: RegistryField = "purpose";
    setSavingCell({ id: req.id, field });
    setCellErrors((prev) => ({ ...prev, [cellErrorKey(req.id, field)]: "" }));
    try {
      await updateMarketingRequestPurpose(session, req.id, draft);
      onUpdated();
    } catch (e: unknown) {
      setCellErrors((prev) => ({
        ...prev,
        [cellErrorKey(req.id, field)]: e instanceof Error ? e.message : "Failed to save",
      }));
    } finally {
      setSavingCell(null);
    }
  };

  const handleSaveLabel = async (req: MarketingRequest) => {
    if (!session || !canEditLabel(req)) return;
    const draft = labelDrafts[req.id] ?? "";
    if (draft === (req.actual_shipping_label ?? "")) return;

    const field: RegistryField = "label";
    setSavingCell({ id: req.id, field });
    setCellErrors((prev) => ({ ...prev, [cellErrorKey(req.id, field)]: "" }));
    try {
      await updateMarketingActualShippingLabel(session, req.id, draft);
      onUpdated();
    } catch (e: unknown) {
      setCellErrors((prev) => ({
        ...prev,
        [cellErrorKey(req.id, field)]: e instanceof Error ? e.message : "Failed to save",
      }));
    } finally {
      setSavingCell(null);
    }
  };

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
                  Track status and carrier labels for your requests. Edit{" "}
                  <span className="font-semibold">Purpose</span> or{" "}
                  <span className="font-semibold">Actual shipping label</span> inline — changes save
                  when you click the checkmark.
                </>
              ) : (
                <>
                  All ongoing and completed orders. Edit <span className="font-semibold">Purpose</span> or
                  record <span className="font-semibold">Actual shipping label</span> for{" "}
                  <span className="font-semibold">Regular</span> and{" "}
                  <span className="font-semibold">Kargo</span> shipments inline.
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
            Sign in as fulfillment admin above to edit purpose and shipping labels for any order.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1040px]">
          <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Barcode</th>
              <th className="px-3 py-3">Recipient</th>
              <th className="px-3 py-3">Courier</th>
              <th className="px-3 py-3">Due</th>
              <th className="px-3 py-3 min-w-[180px]">Purpose</th>
              <th className="px-3 py-3 text-right">Items</th>
              <th className="px-3 py-3">Shipped</th>
              <th className="px-3 py-3 min-w-[220px]">Actual shipping label</th>
              <th className="px-3 py-3 w-8" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => {
              const needsLabel = courierNeedsActualShippingLabel(req.preferred_courier);
              const purposeDraft = purposeDrafts[req.id] ?? "";
              const labelDraft = labelDrafts[req.id] ?? "";
              const purposeDirty = purposeDraft !== (req.request_purpose ?? "");
              const labelDirty = labelDraft !== (req.actual_shipping_label ?? "");
              const savingPurpose =
                savingCell?.id === req.id && savingCell.field === "purpose";
              const savingLabel = savingCell?.id === req.id && savingCell.field === "label";

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
                  <td className="px-3 py-3">
                    <RegistryInlineField
                      draft={purposeDraft}
                      savedValue={req.request_purpose ?? ""}
                      placeholder="Event / purpose"
                      canEdit={canEditPurpose(req)}
                      isSaving={savingPurpose}
                      isDirty={purposeDirty}
                      error={cellErrors[cellErrorKey(req.id, "purpose")]}
                      onDraftChange={(value) =>
                        setPurposeDrafts((prev) => ({ ...prev, [req.id]: value }))
                      }
                      onSave={() => handleSavePurpose(req)}
                    />
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
                  <td className="px-3 py-3">
                    {!needsLabel ? (
                      <span className="text-xs text-gray-500 italic">N/A ({req.preferred_courier ?? "—"})</span>
                    ) : (
                      <RegistryInlineField
                        draft={labelDraft}
                        savedValue={req.actual_shipping_label ?? ""}
                        placeholder="Tracking / label ref"
                        canEdit={canEditLabel(req)}
                        isSaving={savingLabel}
                        isDirty={labelDirty}
                        mono
                        error={cellErrors[cellErrorKey(req.id, "label")]}
                        savedMeta={
                          req.actual_shipping_label_at ? (
                            <p className="text-[10px] text-gray-500">
                              {req.actual_shipping_label_by} · {formatWhen(req.actual_shipping_label_at)}
                            </p>
                          ) : undefined
                        }
                        onDraftChange={(value) =>
                          setLabelDrafts((prev) => ({ ...prev, [req.id]: value }))
                        }
                        onSave={() => handleSaveLabel(req)}
                      />
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
