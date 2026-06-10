"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2, Printer, Trash2, X } from "lucide-react";
import { DashButton, cx } from "../dashboard/primitives";
import { RequestChat } from "./RequestChat";
import {
  courierNeedsActualShippingLabel,
  type MarketingRequest,
  type MarketingSession,
} from "../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );
}

export function MarketingRequestDetailModal({
  request,
  onClose,
  session,
  unreadCount = 0,
  onRead,
  onDelete,
  deleting = false,
}: {
  request: MarketingRequest;
  onClose: () => void;
  session: MarketingSession | null;
  unreadCount?: number;
  onRead?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketing-request-detail-title"
    >
      <div
        className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Order details</p>
            <h2 id="marketing-request-detail-title" className="text-lg font-black text-gray-900">
              {request.recipient_name}
            </h2>
            <p className="text-xs font-mono text-gray-600 mt-0.5">{request.barcode}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cx(
                "text-xs font-bold uppercase px-2 py-1 rounded-full",
                statusStyles[request.status] ?? statusStyles.pending
              )}
            >
              {request.status}
            </span>
            <DashButton type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" />
            </DashButton>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          {request.request_purpose && (
            <DetailRow label="Event / purpose">
              <span className="font-semibold text-violet-800">{request.request_purpose}</span>
            </DetailRow>
          )}

          <DetailRow label="Ship to">
            <p className="font-semibold">{request.recipient_name}</p>
            {request.recipient_phone && <p>{request.recipient_phone}</p>}
            <p>{request.address_line1}</p>
            {request.address_line2 && <p>{request.address_line2}</p>}
            <p>
              {request.city}, {request.state} {request.postal_code}
            </p>
            <p>{request.country}</p>
          </DetailRow>

          {(request.preferred_courier || request.due_date) && (
            <div className="flex flex-wrap gap-2">
              {request.preferred_courier && (
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-violet-100 text-violet-800">
                  {request.preferred_courier}
                </span>
              )}
              {request.due_date && (
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">
                  Due {new Date(request.due_date + "T12:00:00").toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          <DetailRow label="Items packed">
            <ul className="space-y-1">
              {(request.items ?? []).map((item) => (
                <li key={item.id ?? `${item.product_name}-${item.qty}`}>
                  <span className="font-bold tabular-nums">{item.qty}×</span> {item.product_name}
                  {item.product_barcode && (
                    <span className="text-gray-500 font-mono text-xs ml-2">{item.product_barcode}</span>
                  )}
                </li>
              ))}
            </ul>
          </DetailRow>

          {request.notes && (
            <DetailRow label="Notes">
              <p className="bg-amber-50 text-amber-900 border border-amber-100 rounded-lg px-3 py-2 text-sm">
                {request.notes}
              </p>
            </DetailRow>
          )}

          <div className="grid sm:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <DetailRow label="Requested">
              <p className="font-semibold">{request.requested_by_name}</p>
              <p className="text-xs text-gray-600">{formatWhen(request.created_at)}</p>
            </DetailRow>
            <DetailRow label="Packed">
              <p className="font-semibold">{request.packed_by ?? "—"}</p>
              <p className="text-xs text-gray-600">{formatWhen(request.packed_at)}</p>
            </DetailRow>
            <DetailRow label="Shipped">
              <p className="font-semibold">{request.shipped_by ?? "—"}</p>
              <p className="text-xs text-gray-600">{formatWhen(request.shipped_at)}</p>
            </DetailRow>
          </div>

          {courierNeedsActualShippingLabel(request.preferred_courier) && (
            <DetailRow label="Actual shipping label">
              {request.actual_shipping_label ? (
                <>
                  <p className="font-mono font-semibold">{request.actual_shipping_label}</p>
                  {request.actual_shipping_label_at && (
                    <p className="text-xs text-gray-600 mt-1">
                      Recorded by {request.actual_shipping_label_by ?? "—"} ·{" "}
                      {formatWhen(request.actual_shipping_label_at)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-gray-500 italic">Not recorded yet — use the Shipment registry tab.</p>
              )}
            </DetailRow>
          )}

          <RequestChat
            requestId={request.id}
            packageLabel={`${request.recipient_name} · ${request.barcode}`}
            session={session}
            unreadCount={unreadCount}
            onRead={onRead}
          />

          <div className="flex flex-col gap-2">
            <Link href={`/marketing/labels/${request.id}`} className="block">
              <DashButton variant="primary" size="md" className="w-full">
                <Printer className="w-4 h-4" /> Reprint label
              </DashButton>
            </Link>
            {onDelete && (
              <DashButton
                type="button"
                variant="danger"
                size="md"
                className="w-full"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete request
              </DashButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
