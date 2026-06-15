import { timingSafeEqual } from "node:crypto";

export type BiteshipWebhookEvent = "order.status" | "order.waybill_id" | "order.price";

export interface BiteshipWebhookPayload {
  event?: string;
  order_id?: string;
  status?: string;
  courier_tracking_id?: string | null;
  courier_waybill_id?: string | null;
  courier_company?: string | null;
  courier_type?: string | null;
  courier_link?: string | null;
  order_price?: number | null;
  price?: number | null;
}

const HANDLED_EVENTS = new Set<string>(["order.status", "order.waybill_id", "order.price"]);

export function isBiteshipWebhookVerificationConfigured(): boolean {
  return !!process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET?.trim();
}

export function verifyBiteshipWebhookSignature(request: Request): boolean {
  const expectedSecret = process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET?.trim();
  if (!expectedSecret) return true;

  const headerName =
    process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY?.trim() || "X-Biteship-Signature";
  const received =
    request.headers.get(headerName) ?? request.headers.get(headerName.toLowerCase());

  if (!received) return false;

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expectedSecret, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function parseBiteshipWebhookPayload(rawBody: string): BiteshipWebhookPayload {
  const parsed = JSON.parse(rawBody) as BiteshipWebhookPayload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Webhook body must be a JSON object.");
  }
  return parsed;
}

export function shouldHandleBiteshipWebhookEvent(event: string | undefined): event is BiteshipWebhookEvent {
  return !!event && HANDLED_EVENTS.has(event);
}

export function buildMarketingUpdateFromWebhook(
  payload: BiteshipWebhookPayload
): Record<string, string | null> {
  const now = new Date().toISOString();
  const update: Record<string, string | null> = {
    biteship_status_updated_at: now,
  };

  if (payload.status?.trim()) {
    update.biteship_status = payload.status.trim();
  }

  const tracking =
    payload.courier_waybill_id?.trim() || payload.courier_tracking_id?.trim() || null;
  if (tracking) {
    update.actual_shipping_label = tracking;
    update.actual_shipping_label_at = now;
    update.actual_shipping_label_by = "Biteship";
  }

  if (payload.courier_link?.trim()) {
    update.biteship_waybill_url = payload.courier_link.trim();
  }

  if (payload.courier_company?.trim()) {
    update.biteship_courier_company = payload.courier_company.trim();
  }

  if (payload.courier_type?.trim()) {
    update.biteship_courier_type = payload.courier_type.trim();
  }

  return update;
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  allocated: "Allocated",
  picking_up: "Courier en route",
  picked: "Picked up",
  in_transit: "In transit",
  dropping_off: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  on_hold: "On hold",
  return_in_transit: "Return in transit",
  returned: "Returned",
  rejected: "Rejected",
  disposed: "Disposed",
  courier_not_found: "Courier not found",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-800",
  scheduled: "bg-blue-100 text-blue-800",
  allocated: "bg-indigo-100 text-indigo-800",
  picking_up: "bg-violet-100 text-violet-800",
  picked: "bg-violet-100 text-violet-800",
  in_transit: "bg-violet-100 text-violet-800",
  dropping_off: "bg-amber-100 text-amber-900",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  on_hold: "bg-amber-100 text-amber-900",
  return_in_transit: "bg-orange-100 text-orange-900",
  returned: "bg-orange-100 text-orange-900",
  rejected: "bg-red-100 text-red-800",
  disposed: "bg-gray-100 text-gray-700",
  courier_not_found: "bg-red-100 text-red-800",
};

export function formatBiteshipStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const key = status.trim().toLowerCase();
  return STATUS_LABELS[key] ?? status.replaceAll("_", " ");
}

export function biteshipStatusStyle(status: string | null | undefined): string {
  if (!status) return "bg-gray-100 text-gray-700";
  const key = status.trim().toLowerCase();
  return STATUS_STYLES[key] ?? "bg-orange-100 text-orange-800";
}
