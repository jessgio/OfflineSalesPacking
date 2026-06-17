import type { MarketingCourier } from "../types/marketing";

const BITESHIP_API_BASE = "https://api.biteship.com/v1";

export interface BiteshipConfig {
  apiKey: string;
  originPostalCode: number;
  originAddress: string;
  shipperName: string;
  shipperPhone: string;
  shipperEmail: string | null;
}

export interface BiteshipPackageInput {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  valueIdr: number;
}

export interface BiteshipRateOption {
  courierCompany: string;
  courierCompanyName: string;
  courierType: string;
  courierTypeName: string;
  price: number;
  duration: string;
  matchesPreference: boolean;
}

export interface BiteshipCreateOrderResult {
  orderId: string;
  status: string;
  /** Carrier air waybill (e.g. JNE resi) — use on printed labels. */
  waybillId: string | null;
  /** Biteship internal tracking object ID — not a carrier AWB. */
  trackingId: string | null;
  waybillUrl: string | null;
  courierCompany: string;
  courierType: string;
  price: number | null;
}

/** Biteship tracking refs are 24-char hex IDs, not carrier AWB numbers. */
export function isBiteshipInternalTrackingRef(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value.trim());
}

/** Prefer courier waybill numbers; ignore Biteship internal tracking IDs. */
export function pickCarrierWaybillId(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (!isBiteshipInternalTrackingRef(value)) return value;
  }
  return null;
}

export function isBiteshipConfigured(): boolean {
  return !!(
    process.env.BITESHIP_API_KEY?.trim() &&
    process.env.BITESHIP_ORIGIN_POSTAL_CODE?.trim() &&
    process.env.BITESHIP_ORIGIN_ADDRESS?.trim() &&
    process.env.BITESHIP_SHIPPER_PHONE?.trim()
  );
}

export function getBiteshipConfig(): BiteshipConfig {
  const apiKey = process.env.BITESHIP_API_KEY?.trim();
  const originPostalCode = parsePostalCode(process.env.BITESHIP_ORIGIN_POSTAL_CODE);
  const originAddress = process.env.BITESHIP_ORIGIN_ADDRESS?.trim();
  const shipperPhone = process.env.BITESHIP_SHIPPER_PHONE?.trim();

  if (!apiKey) throw new Error("BITESHIP_API_KEY is not configured.");
  if (!originPostalCode) throw new Error("BITESHIP_ORIGIN_POSTAL_CODE is not configured.");
  if (!originAddress) throw new Error("BITESHIP_ORIGIN_ADDRESS is not configured.");
  if (!shipperPhone) throw new Error("BITESHIP_SHIPPER_PHONE is not configured.");

  return {
    apiKey,
    originPostalCode,
    originAddress,
    shipperName: process.env.BITESHIP_SHIPPER_NAME?.trim() || "Aeris Beaute",
    shipperPhone,
    shipperEmail: process.env.BITESHIP_SHIPPER_EMAIL?.trim() || null,
  };
}

export function parsePostalCode(value: string | null | undefined): number | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  const parsed = Number.parseInt(digits.slice(0, 5), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "08123456789";
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  return `0${digits}`;
}

function buildDestinationAddress(parts: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
}): string {
  return [parts.addressLine1, parts.addressLine2, parts.city, parts.state]
    .filter(Boolean)
    .join(", ");
}

function buildItemsPayload(
  items: Array<{ product_name: string; qty: number }>,
  pkg: BiteshipPackageInput
) {
  const primaryName =
    items.length === 1
      ? items[0].product_name
      : items.length > 1
        ? `Marketing goods (${items.length} SKUs)`
        : "Marketing goods";

  return [
    {
      name: primaryName.slice(0, 255),
      description: items.map((item) => `${item.qty}× ${item.product_name}`).join(", ").slice(0, 500),
      category: "others",
      value: pkg.valueIdr,
      quantity: 1,
      length: pkg.lengthCm,
      width: pkg.widthCm,
      height: pkg.heightCm,
      weight: pkg.weightGrams,
    },
  ];
}

async function biteshipFetch<T>(path: string, init: RequestInit): Promise<T> {
  const config = getBiteshipConfig();
  const response = await fetch(`${BITESHIP_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: config.apiKey,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      (typeof body.error === "string" && body.error) ||
      (typeof body.message === "string" && body.message) ||
      `Biteship request failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

type RawPricing = {
  available_for_cash_on_delivery?: boolean;
  available_for_proof_of_delivery?: boolean;
  available_for_instant_waybill_id?: boolean;
  available_for_insurance?: boolean;
  company?: string;
  courier_name?: string;
  courier_code?: string;
  courier_service_name?: string;
  courier_service_code?: string;
  description?: string;
  duration?: string;
  shipment_duration_range?: { minimum?: number; maximum?: number };
  service_type?: string;
  shipping_type?: string;
  price?: number;
  type?: string;
};

type RatesResponse = {
  success?: boolean;
  pricing?: RawPricing[];
};

function formatDuration(rate: RawPricing): string {
  if (rate.duration?.trim()) return rate.duration.trim();
  const min = rate.shipment_duration_range?.minimum;
  const max = rate.shipment_duration_range?.maximum;
  if (min != null && max != null) return `${min}–${max} days`;
  if (min != null) return `${min} days`;
  return "—";
}

/** Biteship courier company codes to query per preferred tier (required by Rates API). */
function biteshipCourierCodesForPreference(
  courier: MarketingCourier | null | undefined
): string {
  const codesByTier: Record<
    Extract<MarketingCourier, "Instant" | "Same Day" | "Regular" | "Kargo">,
    string[]
  > = {
    Instant: ["grab", "gojek", "borzo"],
    "Same Day": ["grab", "gojek", "lalamove"],
    Regular: ["jne", "sicepat", "anteraja", "tiki", "idexpress", "ninja", "paxel", "lion"],
    Kargo: ["jnt", "jne", "sap", "sentral", "lion", "rpx"],
  };

  if (courier && courier in codesByTier) {
    return codesByTier[courier as keyof typeof codesByTier].join(",");
  }
  return codesByTier.Regular.join(",");
}

/** Map portal courier preference to Biteship service type codes. */
export function biteshipServiceTypesForPreference(
  courier: MarketingCourier | null | undefined
): string[] | null {
  switch (courier) {
    case "Instant":
      return ["instant", "instant_bike", "instant_car", "instant_motorcycle"];
    case "Same Day":
      return ["same_day", "sds", "smd", "q9_same_day", "SAME_DAY"];
    case "Regular":
      return ["reg", "regular", "next_day", "standard", "ez"];
    case "Kargo":
      return ["cargo", "gokil", "jtr", "jtr_150", "jtr_250", "trc"];
    default:
      return null;
  }
}

function rateMatchesPreference(
  rate: RawPricing,
  preferredTypes: string[] | null
): boolean {
  if (!preferredTypes) return false;
  const serviceCode = (rate.courier_service_code ?? rate.type ?? "").toLowerCase();
  return preferredTypes.some((type) => serviceCode === type.toLowerCase());
}

export async function fetchBiteshipRates(input: {
  destinationPostalCode: number;
  preferredCourier: MarketingCourier | null;
  items: Array<{ product_name: string; qty: number }>;
  package: BiteshipPackageInput;
}): Promise<BiteshipRateOption[]> {
  const config = getBiteshipConfig();
  const preferredTypes = biteshipServiceTypesForPreference(input.preferredCourier);

  const payload = {
    origin_postal_code: config.originPostalCode,
    destination_postal_code: input.destinationPostalCode,
    couriers: biteshipCourierCodesForPreference(input.preferredCourier),
    items: buildItemsPayload(input.items, input.package),
  };

  const data = await biteshipFetch<RatesResponse>("/rates/couriers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const preferredTypeSet = preferredTypes?.map((t) => t.toLowerCase()) ?? null;

  const options = (data.pricing ?? [])
    .filter((rate) => rate.courier_code && rate.courier_service_code && rate.price != null)
    .map((rate) => ({
      courierCompany: rate.courier_code!,
      courierCompanyName: rate.courier_name ?? rate.courier_code!,
      courierType: rate.courier_service_code!,
      courierTypeName: rate.courier_service_name ?? rate.courier_service_code!,
      price: rate.price!,
      duration: formatDuration(rate),
      matchesPreference: rateMatchesPreference(rate, preferredTypes),
    }))
    .sort((a, b) => {
      if (a.matchesPreference !== b.matchesPreference) {
        return a.matchesPreference ? -1 : 1;
      }
      return a.price - b.price;
    });

  if (preferredTypeSet && options.some((o) => o.matchesPreference)) {
    return options;
  }

  return options;
}

type CreateOrderResponse = {
  success?: boolean;
  id?: string;
  status?: string;
  price?: number;
  courier?: {
    tracking_id?: string | null;
    company?: string;
    type?: string;
    link?: string | null;
    waybill_id?: string | null;
  };
};

export async function createBiteshipOrder(input: {
  referenceId: string;
  destination: {
    contactName: string;
    contactPhone: string | null;
    postalCode: number;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    note: string | null;
  };
  courierCompany: string;
  courierType: string;
  items: Array<{ product_name: string; qty: number }>;
  package: BiteshipPackageInput;
  orderNote?: string | null;
}): Promise<BiteshipCreateOrderResult> {
  const config = getBiteshipConfig();
  const destinationAddress = buildDestinationAddress({
    addressLine1: input.destination.addressLine1,
    addressLine2: input.destination.addressLine2,
    city: input.destination.city,
    state: input.destination.state,
  });
  const shipperPhone = normalizePhone(config.shipperPhone);
  const destinationPhone = normalizePhone(input.destination.contactPhone);

  const payload: Record<string, unknown> = {
    shipper_contact_name: config.shipperName,
    shipper_contact_phone: shipperPhone,
    origin_contact_name: config.shipperName,
    origin_contact_phone: shipperPhone,
    origin_postal_code: config.originPostalCode,
    origin_address: config.originAddress,
    destination_contact_name: input.destination.contactName,
    destination_contact_phone: destinationPhone,
    destination_postal_code: input.destination.postalCode,
    destination_address: destinationAddress,
    destination_note: input.destination.note,
    courier_company: input.courierCompany,
    courier_type: input.courierType,
    delivery_type: "now",
    reference_id: input.referenceId,
    order_note: input.orderNote ?? undefined,
    metadata: { source: "aeris-marketing-fulfill" },
    items: buildItemsPayload(input.items, input.package),
  };

  if (config.shipperEmail) {
    payload.shipper_contact_email = config.shipperEmail;
  }

  const data = await biteshipFetch<CreateOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!data.id) {
    throw new Error("Biteship did not return an order ID.");
  }

  return {
    orderId: data.id,
    status: data.status ?? "confirmed",
    waybillId: pickCarrierWaybillId(data.courier?.waybill_id),
    trackingId: data.courier?.tracking_id?.trim() || null,
    waybillUrl: data.courier?.link ?? null,
    courierCompany: data.courier?.company ?? input.courierCompany,
    courierType: data.courier?.type ?? input.courierType,
    price: data.price ?? null,
  };
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface BiteshipTrackingHistoryEntry {
  status: string;
  note: string;
  updatedAt: string;
  serviceType: string | null;
}

export interface BiteshipTrackingSnapshot {
  status: string;
  waybillId: string | null;
  trackingId: string | null;
  courierCompany: string | null;
  courierType: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverPlateNumber: string | null;
  originContactName: string | null;
  originAddress: string | null;
  destinationContactName: string | null;
  destinationAddress: string | null;
  trackingLink: string | null;
  orderId: string | null;
  history: BiteshipTrackingHistoryEntry[];
  source: "order" | "tracking" | "public";
}

type RawHistoryEntry = {
  status?: string;
  note?: string;
  updated_at?: string;
  service_type?: string;
};

function normalizeHistory(entries: RawHistoryEntry[] | undefined): BiteshipTrackingHistoryEntry[] {
  return (entries ?? [])
    .filter((entry) => entry.status && entry.updated_at)
    .map((entry) => ({
      status: entry.status!.trim(),
      note: entry.note?.trim() || "",
      updatedAt: entry.updated_at!,
      serviceType: entry.service_type?.trim() || null,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function snapshotFromTrackingPayload(
  data: Record<string, unknown>,
  source: BiteshipTrackingSnapshot["source"]
): BiteshipTrackingSnapshot {
  const courier = (data.courier ?? {}) as Record<string, unknown>;
  const origin = (data.origin ?? {}) as Record<string, unknown>;
  const destination = (data.destination ?? {}) as Record<string, unknown>;
  const history = normalizeHistory(
    (data.history ?? courier.history) as RawHistoryEntry[] | undefined
  );

  return {
    status: String(data.status ?? history[0]?.status ?? "unknown"),
    waybillId: pickCarrierWaybillId(
      data.waybill_id as string | undefined,
      courier.waybill_id as string | undefined,
      courier.tracking_id as string | undefined
    ),
    trackingId:
      (data.id as string | undefined)?.trim() ||
      (courier.tracking_id as string | undefined)?.trim() ||
      null,
    courierCompany: (courier.company as string | undefined)?.trim() || null,
    courierType: (courier.type as string | undefined)?.trim() || null,
    driverName:
      (courier.driver_name as string | undefined)?.trim() ||
      (courier.name as string | undefined)?.trim() ||
      null,
    driverPhone:
      (courier.driver_phone as string | undefined)?.trim() ||
      (courier.phone as string | undefined)?.trim() ||
      null,
    driverPlateNumber: (courier.driver_plate_number as string | undefined)?.trim() || null,
    originContactName: (origin.contact_name as string | undefined)?.trim() || null,
    originAddress: (origin.address as string | undefined)?.trim() || null,
    destinationContactName: (destination.contact_name as string | undefined)?.trim() || null,
    destinationAddress: (destination.address as string | undefined)?.trim() || null,
    trackingLink:
      (data.link as string | undefined)?.trim() ||
      (courier.link as string | undefined)?.trim() ||
      null,
    orderId: (data.order_id as string | undefined)?.trim() || (data.id as string | undefined)?.trim() || null,
    history,
    source,
  };
}

type OrderTrackingResponse = {
  success?: boolean;
  id?: string;
  status?: string;
  courier?: {
    tracking_id?: string;
    waybill_id?: string;
    company?: string;
    type?: string;
    link?: string;
    driver_name?: string;
    driver_phone?: string;
    driver_plate_number?: string;
    history?: RawHistoryEntry[];
  };
  origin?: { contact_name?: string; address?: string };
  destination?: { contact_name?: string; address?: string };
};

type TrackingResponse = OrderTrackingResponse & {
  waybill_id?: string;
  history?: RawHistoryEntry[];
  link?: string;
  order_id?: string;
};

/** Fetch live tracking from a Biteship order ID (includes courier history). */
export async function fetchBiteshipOrderTracking(orderId: string): Promise<BiteshipTrackingSnapshot> {
  const data = await biteshipFetch<OrderTrackingResponse>(`/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });

  if (!data.id) {
    throw new Error("Biteship did not return order details.");
  }

  return snapshotFromTrackingPayload(data as Record<string, unknown>, "order");
}

/** Fetch tracking by Biteship tracking object ID. */
export async function fetchBiteshipTrackingById(trackingId: string): Promise<BiteshipTrackingSnapshot> {
  const data = await biteshipFetch<TrackingResponse>(
    `/trackings/${encodeURIComponent(trackingId)}`,
    { method: "GET" }
  );

  return snapshotFromTrackingPayload(data as Record<string, unknown>, "tracking");
}

/** Fetch public waybill tracking for any courier supported by Biteship. */
export async function fetchBiteshipPublicTracking(
  waybillId: string,
  courierCode: string
): Promise<BiteshipTrackingSnapshot> {
  const data = await biteshipFetch<TrackingResponse>(
    `/trackings/${encodeURIComponent(waybillId)}/couriers/${encodeURIComponent(courierCode)}`,
    { method: "GET" }
  );

  return snapshotFromTrackingPayload(data as Record<string, unknown>, "public");
}

export async function resolveBiteshipTracking(input: {
  orderId?: string | null;
  trackingId?: string | null;
  waybillId?: string | null;
  courierCompany?: string | null;
}): Promise<BiteshipTrackingSnapshot> {
  const orderId = input.orderId?.trim();
  const trackingId = input.trackingId?.trim();
  const storedWaybill = input.waybillId?.trim();
  const carrierWaybill =
    storedWaybill && !isBiteshipInternalTrackingRef(storedWaybill) ? storedWaybill : null;
  const courierCompany = input.courierCompany?.trim();

  if (orderId) {
    try {
      return await fetchBiteshipOrderTracking(orderId);
    } catch (orderErr) {
      if (!trackingId && !(carrierWaybill && courierCompany)) {
        throw orderErr;
      }
    }
  }

  if (trackingId) {
    try {
      return await fetchBiteshipTrackingById(trackingId);
    } catch (trackingErr) {
      if (!(carrierWaybill && courierCompany)) {
        throw trackingErr;
      }
    }
  }

  if (carrierWaybill && courierCompany) {
    return fetchBiteshipPublicTracking(carrierWaybill, courierCompany);
  }

  throw new Error("No Biteship order, tracking ID, or waybill available for this shipment.");
}
