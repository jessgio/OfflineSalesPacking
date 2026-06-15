import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import {
  buildMarketingUpdateFromWebhook,
  isBiteshipWebhookInstallProbe,
  parseBiteshipWebhookPayload,
  shouldHandleBiteshipWebhookEvent,
  verifyBiteshipWebhookSignature,
} from "../../../../lib/biteshipWebhook";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Biteship installation check: accept empty application/json without signature.
  if (isBiteshipWebhookInstallProbe(rawBody)) {
    return NextResponse.json({ ok: true });
  }

  if (!verifyBiteshipWebhookSignature(request)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseBiteshipWebhookPayload(rawBody);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON body" },
      { status: 400 }
    );
  }

  const orderId = payload.order_id?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  }

  if (!shouldHandleBiteshipWebhookEvent(payload.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (payload.event === "order.price" && !payload.status) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const update = buildMarketingUpdateFromWebhook(payload);

  const { data, error } = await supabase
    .from("marketing_requests")
    .update(update)
    .eq("biteship_order_id", orderId)
    .select("id, barcode, biteship_status")
    .maybeSingle();

  if (error) {
    console.error("biteship webhook update error:", error, payload);
    return NextResponse.json({ error: "Failed to update marketing request" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, matched: false, orderId });
  }

  console.info("biteship webhook applied", {
    orderId,
    event: payload.event,
    status: payload.status,
    requestId: data.id,
    barcode: data.barcode,
  });

  return NextResponse.json({
    ok: true,
    matched: true,
    requestId: data.id,
    biteshipStatus: data.biteship_status,
  });
}
