export type MarketingRequestStatus = "pending" | "packed" | "shipped" | "cancelled";

export const MARKETING_COURIER_OPTIONS = [
  "Instant",
  "Same Day",
  "Regular",
  "Kargo",
] as const;

export type MarketingCourier = (typeof MARKETING_COURIER_OPTIONS)[number];

/** Couriers where fulfillment records the carrier label / tracking after dispatch. */
export const MARKETING_COURIERS_WITH_SHIPPING_LABEL = ["Regular", "Kargo"] as const;

export function courierNeedsActualShippingLabel(
  courier: MarketingCourier | null | undefined
): boolean {
  return courier === "Regular" || courier === "Kargo";
}

export type MarketingUserRole = "requester" | "fulfillment" | "admin";

export const REQUESTER_DIVISIONS = [
  "Marketing",
  "R&D",
  "Leadership",
  "Operations",
  "Other",
] as const;

export type RequesterDivision = (typeof REQUESTER_DIVISIONS)[number];

export interface MarketingChatParticipant {
  email: string;
  display_name: string;
  role: MarketingUserRole;
  division: RequesterDivision;
  handle: string;
}

export interface MarketingRequestMessage {
  id: string;
  request_id: string;
  author_email: string;
  author_name: string;
  author_role: MarketingUserRole | "marketing";
  body: string;
  created_at: string;
}

export interface MarketingUser {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
}

export interface MarketingSession {
  email: string;
  displayName: string;
  role: MarketingUserRole;
  division: RequesterDivision;
}

export interface MarketingRequestItem {
  id?: string;
  request_id?: string;
  product_barcode: string | null;
  product_name: string;
  qty: number;
}

export interface MarketingRequest {
  id: string;
  barcode: string;
  status: MarketingRequestStatus;
  requested_by_email: string;
  requested_by_name: string;
  requested_by_division: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  due_date: string | null;
  preferred_courier: MarketingCourier | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  notes: string | null;
  request_purpose: string | null;
  packed_by: string | null;
  packed_at: string | null;
  shipped_by: string | null;
  shipped_at: string | null;
  actual_shipping_label: string | null;
  actual_shipping_label_at: string | null;
  actual_shipping_label_by: string | null;
  created_at: string;
  items?: MarketingRequestItem[];
}

export interface NewMarketingRequestInput {
  recipient_name: string;
  recipient_phone: string;
  due_date: string;
  preferred_courier: MarketingCourier;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  notes?: string;
  request_purpose?: string;
  items: { product_barcode?: string; product_name: string; qty: number }[];
}
