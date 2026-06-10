import { supabase } from "./supabaseClient";
import { generateMarketingBarcode } from "./marketingBarcode";
import { getSupabaseErrorMessage } from "./supabaseError";
import type {
  MarketingRequest,
  MarketingSession,
  NewMarketingRequestInput,
} from "../types/marketing";

function normalizeRequestPurpose(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function rememberMarketingRequestPurpose(purpose: string | null): Promise<void> {
  if (!purpose) return;
  await supabase.from("marketing_request_purposes").upsert(
    { label: purpose, last_used_at: new Date().toISOString() },
    { onConflict: "label" }
  );
}

export async function fetchMarketingRequestPurposes(): Promise<string[]> {
  const { data, error } = await supabase
    .from("marketing_request_purposes")
    .select("label")
    .order("last_used_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load saved purposes"));
  return (data ?? []).map((row) => row.label);
}

export async function loginMarketingUser(
  email: string,
  pin: string
): Promise<MarketingSession> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("marketing_users")
    .select("email, display_name, pin, active, role")
    .eq("email", normalizedEmail)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Login failed"));
  if (!data || data.pin !== pin.trim()) {
    throw new Error("Invalid email or PIN. Contact ops to get access.");
  }

  return {
    email: data.email,
    displayName: data.display_name,
    role: (data.role === "admin" ? "admin" : "marketing") as MarketingSession["role"],
  };
}

export async function createMarketingRequest(
  session: MarketingSession,
  input: NewMarketingRequestInput
): Promise<MarketingRequest> {
  if (!input.items.length) throw new Error("Add at least one item to the request.");

  const barcode = generateMarketingBarcode();
  const requestPurpose = normalizeRequestPurpose(input.request_purpose);

  const { data: request, error: requestError } = await supabase
    .from("marketing_requests")
    .insert({
      barcode,
      status: "pending",
      requested_by_email: session.email,
      requested_by_name: session.displayName,
      recipient_name: input.recipient_name.trim(),
      recipient_phone: input.recipient_phone.trim(),
      due_date: input.due_date,
      preferred_courier: input.preferred_courier,
      address_line1: input.address_line1.trim(),
      address_line2: input.address_line2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      postal_code: input.postal_code.trim(),
      country: input.country.trim() || "Singapore",
      notes: input.notes?.trim() || null,
      request_purpose: requestPurpose,
    })
    .select("*")
    .single();

  if (requestError || !request) {
    throw new Error(getSupabaseErrorMessage(requestError, "Failed to create request"));
  }

  const itemRows = input.items.map((item) => ({
    request_id: request.id,
    product_barcode: item.product_barcode?.trim() || null,
    product_name: item.product_name.trim(),
    qty: item.qty,
  }));

  const { error: itemsError } = await supabase.from("marketing_request_items").insert(itemRows);
  if (itemsError) {
    await supabase.from("marketing_requests").delete().eq("id", request.id);
    throw new Error(getSupabaseErrorMessage(itemsError, "Failed to save request items"));
  }

  await rememberMarketingRequestPurpose(requestPurpose);

  return { ...request, items: itemRows };
}

async function assertMarketingRequestEditable(
  session: MarketingSession,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("id, status, requested_by_email")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to verify request"));
  if (!data) throw new Error("Request not found.");
  if (data.requested_by_email !== session.email) {
    throw new Error("You can only change your own requests.");
  }
  if (data.status !== "pending") {
    throw new Error("Only pending requests can be edited or deleted.");
  }
}

export async function updateMarketingRequest(
  session: MarketingSession,
  id: string,
  input: NewMarketingRequestInput
): Promise<MarketingRequest> {
  if (!input.items.length) throw new Error("Add at least one item to the request.");

  await assertMarketingRequestEditable(session, id);

  const requestPurpose = normalizeRequestPurpose(input.request_purpose);

  const { data: request, error: requestError } = await supabase
    .from("marketing_requests")
    .update({
      recipient_name: input.recipient_name.trim(),
      recipient_phone: input.recipient_phone.trim(),
      due_date: input.due_date,
      preferred_courier: input.preferred_courier,
      address_line1: input.address_line1.trim(),
      address_line2: input.address_line2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      postal_code: input.postal_code.trim(),
      country: input.country.trim() || "Singapore",
      notes: input.notes?.trim() || null,
      request_purpose: requestPurpose,
    })
    .eq("id", id)
    .eq("requested_by_email", session.email)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (requestError || !request) {
    throw new Error(getSupabaseErrorMessage(requestError, "Failed to update request"));
  }

  const { error: deleteItemsError } = await supabase
    .from("marketing_request_items")
    .delete()
    .eq("request_id", id);

  if (deleteItemsError) {
    throw new Error(getSupabaseErrorMessage(deleteItemsError, "Failed to update request items"));
  }

  const itemRows = input.items.map((item) => ({
    request_id: id,
    product_barcode: item.product_barcode?.trim() || null,
    product_name: item.product_name.trim(),
    qty: item.qty,
  }));

  const { error: itemsError } = await supabase.from("marketing_request_items").insert(itemRows);
  if (itemsError) {
    throw new Error(getSupabaseErrorMessage(itemsError, "Failed to save request items"));
  }

  await rememberMarketingRequestPurpose(requestPurpose);

  return { ...request, items: itemRows };
}

export async function deleteMarketingRequest(
  session: MarketingSession,
  id: string
): Promise<void> {
  if (session.role === "admin") {
    const { data, error } = await supabase
      .from("marketing_requests")
      .delete()
      .eq("id", id)
      .eq("status", "shipped")
      .select("id");

    if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to delete request"));
    if (!data?.length) {
      throw new Error("Only completed (shipped) orders can be deleted.");
    }
    return;
  }

  await assertMarketingRequestEditable(session, id);

  const { data, error } = await supabase
    .from("marketing_requests")
    .delete()
    .eq("id", id)
    .eq("requested_by_email", session.email)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to delete request"));
  if (!data?.length) throw new Error("Request not found or cannot be deleted.");
}

export async function deleteMarketingRequestsBulk(
  session: MarketingSession,
  ids: string[]
): Promise<number> {
  if (session.role !== "admin") {
    throw new Error("Only fulfillment admins can delete completed shipments.");
  }
  if (ids.length === 0) throw new Error("Select at least one order.");

  const { data, error } = await supabase
    .from("marketing_requests")
    .delete()
    .in("id", ids)
    .eq("status", "shipped")
    .select("id");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to delete requests"));

  const deleted = data?.length ?? 0;
  if (deleted === 0) {
    throw new Error("Only completed (shipped) orders can be deleted.");
  }

  return deleted;
}

export async function createMarketingRequestsBulk(
  session: MarketingSession,
  inputs: NewMarketingRequestInput[]
): Promise<{ created: MarketingRequest[]; errors: string[] }> {
  const created: MarketingRequest[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    const label = `${input.recipient_name} (${input.items.length} item${input.items.length === 1 ? "" : "s"})`;
    try {
      const request = await createMarketingRequest(session, input);
      created.push(request);
    } catch (err: unknown) {
      errors.push(`${label}: ${err instanceof Error ? err.message : "Failed to create request"}`);
    }
  }

  return { created, errors };
}

export async function fetchMarketingRequestsByUser(email: string): Promise<MarketingRequest[]> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .eq("requested_by_email", email)
    .order("created_at", { ascending: false });

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load requests"));

  return (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));
}

export async function fetchPendingMarketingRequests(): Promise<MarketingRequest[]> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .in("status", ["pending", "packed"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load fulfillment queue"));

  return (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));
}

export async function fetchCompletedMarketingRequests(): Promise<MarketingRequest[]> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .eq("status", "shipped")
    .order("shipped_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load completed requests"));

  return (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));
}

export async function fetchAllMarketingRequestsForRegistry(): Promise<MarketingRequest[]> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load shipment registry"));

  return (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));
}

async function assertCanEditRegistryField(
  session: MarketingSession,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("id, status, requested_by_email")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to verify request"));
  if (!data) throw new Error("Request not found.");
  if (data.status === "cancelled") {
    throw new Error("Cancelled requests cannot be edited.");
  }
  if (session.role !== "admin" && data.requested_by_email !== session.email) {
    throw new Error("You can only edit your own requests.");
  }
}

export async function updateMarketingRequestPurpose(
  session: MarketingSession,
  id: string,
  purpose: string
): Promise<MarketingRequest> {
  await assertCanEditRegistryField(session, id);

  const requestPurpose = normalizeRequestPurpose(purpose);
  const { data, error } = await supabase
    .from("marketing_requests")
    .update({ request_purpose: requestPurpose })
    .eq("id", id)
    .select("*, marketing_request_items(*)")
    .maybeSingle();

  if (error || !data) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to save purpose"));
  }

  await rememberMarketingRequestPurpose(requestPurpose);

  return { ...data, items: data.marketing_request_items ?? [] };
}

export async function updateMarketingActualShippingLabel(
  session: MarketingSession,
  id: string,
  label: string
): Promise<MarketingRequest> {
  await assertCanEditRegistryField(session, id);

  const trimmed = label.trim();
  const { data, error } = await supabase
    .from("marketing_requests")
    .update({
      actual_shipping_label: trimmed || null,
      actual_shipping_label_at: trimmed ? new Date().toISOString() : null,
      actual_shipping_label_by: trimmed ? session.displayName : null,
    })
    .eq("id", id)
    .select("*, marketing_request_items(*)")
    .maybeSingle();

  if (error || !data) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to save shipping label"));
  }

  return { ...data, items: data.marketing_request_items ?? [] };
}

export async function fetchMarketingRequestsByIds(ids: string[]): Promise<MarketingRequest[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .in("id", ids);

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load requests"));

  const mapped = (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));

  const byId = new Map(mapped.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is MarketingRequest => Boolean(row));
}

export async function fetchMarketingRequestById(id: string): Promise<MarketingRequest | null> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load request"));
  if (!data) return null;

  return { ...data, items: data.marketing_request_items ?? [] };
}

export async function fetchMarketingRequestByBarcode(barcode: string): Promise<MarketingRequest | null> {
  const { data, error } = await supabase
    .from("marketing_requests")
    .select("*, marketing_request_items(*)")
    .eq("barcode", barcode.trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to look up request"));
  if (!data) return null;

  return { ...data, items: data.marketing_request_items ?? [] };
}

export async function markMarketingRequestPacked(
  id: string,
  packedBy: string
): Promise<void> {
  const { error } = await supabase
    .from("marketing_requests")
    .update({
      status: "packed",
      packed_by: packedBy.trim().toUpperCase(),
      packed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to mark as packed"));
}

export async function markMarketingRequestsPackedBulk(
  ids: string[],
  packedBy: string
): Promise<MarketingRequest[]> {
  const initials = packedBy.trim().toUpperCase();
  if (!initials) throw new Error("Enter your packer initials first.");
  if (ids.length === 0) throw new Error("Select at least one order.");

  const packedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("marketing_requests")
    .update({
      status: "packed",
      packed_by: initials,
      packed_at: packedAt,
    })
    .in("id", ids)
    .eq("status", "pending")
    .select("*, marketing_request_items(*)");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to mark orders as packed"));

  const packed = (data ?? []).map((row) => ({
    ...row,
    items: row.marketing_request_items ?? [],
  }));

  if (packed.length === 0) {
    throw new Error("No pending orders were packed. Selected orders may already be packed or shipped.");
  }

  const byId = new Map(packed.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is MarketingRequest => Boolean(row));
}

export async function markMarketingRequestShipped(id: string, shippedBy: string): Promise<void> {
  const initials = shippedBy.trim().toUpperCase();
  if (!initials) throw new Error("Enter your initials before marking shipped.");

  const { error } = await supabase
    .from("marketing_requests")
    .update({
      status: "shipped",
      shipped_at: new Date().toISOString(),
      shipped_by: initials,
    })
    .eq("id", id)
    .eq("status", "packed");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to mark as shipped"));
}

export async function searchProducts(query: string): Promise<
  { barcode: string; clean_name: string }[]
> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from("products")
    .select("barcode, clean_name")
    .or(`clean_name.ilike.%${term}%,barcode.ilike.%${term}%`)
    .limit(12);

  if (error) throw new Error(getSupabaseErrorMessage(error, "Product search failed"));
  return data ?? [];
}

export async function fetchUnseenMarketingOrderCounts(session: MarketingSession): Promise<{
  total: number;
  byRequestId: Record<string, number>;
}> {
  if (session.role !== "admin") {
    return { total: 0, byRequestId: {} };
  }

  const { data: pending, error: pendingError } = await supabase
    .from("marketing_requests")
    .select("id")
    .eq("status", "pending");

  if (pendingError) {
    throw new Error(getSupabaseErrorMessage(pendingError, "Failed to load pending requests"));
  }

  const { data: seen, error: seenError } = await supabase
    .from("marketing_request_admin_views")
    .select("request_id")
    .eq("admin_email", session.email);

  if (seenError) {
    throw new Error(getSupabaseErrorMessage(seenError, "Failed to load admin views"));
  }

  const seenIds = new Set((seen ?? []).map((row) => row.request_id));
  const byRequestId: Record<string, number> = {};
  let total = 0;

  for (const req of pending ?? []) {
    if (!seenIds.has(req.id)) {
      byRequestId[req.id] = 1;
      total++;
    }
  }

  return { total, byRequestId };
}

export async function markMarketingRequestSeenByAdmin(
  session: MarketingSession,
  requestId: string
): Promise<void> {
  if (session.role !== "admin") return;

  const { error } = await supabase.from("marketing_request_admin_views").upsert(
    {
      request_id: requestId,
      admin_email: session.email,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "request_id,admin_email" }
  );

  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to mark request as seen"));
  }
}
