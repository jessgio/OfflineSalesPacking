import type { MarketingRequest } from "../types/marketing";
import { canTrackWithBiteship } from "../types/marketing";
import { pickCarrierWaybillId } from "./biteship";
import { formatBiteshipStatusLabel } from "./biteshipWebhook";

const COURIER_DISPLAY: Record<string, string> = {
  jnt: "J&T Express",
  jne: "JNE",
  grab: "Grab",
  gosend: "GoSend",
  sicepat: "SiCepat",
  anteraja: "AnterAja",
  ninja: "Ninja Van",
  tiki: "TIKI",
  idexpress: "ID Express",
  rpx: "RPX",
  sap: "SAP Express",
  wahana: "Wahana",
  lion: "Lion Parcel",
  paxel: "Paxel",
};

export function formatCourierCompanyLabel(code: string | null | undefined): string {
  if (!code?.trim()) return "Courier";
  const key = code.trim().toLowerCase();
  return COURIER_DISPLAY[key] ?? code.trim().toUpperCase();
}

export function resolveBiteshipWaybillId(
  request: MarketingRequest,
  override?: string | null
): string | null {
  return pickCarrierWaybillId(override, request.actual_shipping_label);
}

export async function fetchCarrierWaybillForRequest(
  request: MarketingRequest
): Promise<string | null> {
  const fromStored = pickCarrierWaybillId(request.actual_shipping_label);
  if (fromStored) return fromStored;

  if (!canTrackWithBiteship(request)) return null;

  try {
    const res = await fetch(`/api/biteship/tracking?requestId=${encodeURIComponent(request.id)}`);
    const payload = (await res.json()) as {
      tracking?: { waybillId?: string | null };
    };
    if (res.ok) {
      return pickCarrierWaybillId(payload.tracking?.waybillId);
    }
  } catch {
    /* AWB may arrive later via webhook */
  }

  return null;
}

export function biteshipLabelReference(request: MarketingRequest): string {
  return request.barcode.trim();
}

export function biteshipLabelStatus(request: MarketingRequest): string | null {
  if (!request.biteship_status?.trim()) return null;
  return formatBiteshipStatusLabel(request.biteship_status);
}

export function barcodeWidthForValue(value: string): number {
  const len = value.length;
  if (len > 20) return 0.9;
  if (len > 14) return 1.1;
  if (len > 10) return 1.4;
  return 1.8;
}
