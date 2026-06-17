import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import { createBiteshipOrder, isBiteshipConfigured, parsePostalCode } from "../../../../lib/biteship";
import { canBookWithBiteship } from "../../../../types/marketing";

export async function POST(request: Request) {
  if (!isBiteshipConfigured()) {
    return NextResponse.json({ error: "Biteship is not configured on this server." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      requestId?: string;
      courierCompany?: string;
      courierType?: string;
      shippedBy?: string;
      weightGrams?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      valueIdr?: number;
    };

    const { requestId, courierCompany, courierType, shippedBy } = body;
    if (!requestId || !courierCompany || !courierType) {
      return NextResponse.json(
        { error: "requestId, courierCompany, and courierType are required" },
        { status: 400 }
      );
    }

    const initials = shippedBy?.trim().toUpperCase();
    if (!initials) {
      return NextResponse.json({ error: "shippedBy (packer initials) is required" }, { status: 400 });
    }

    const { data: pkg, error: pkgError } = await supabase
      .from("marketing_requests")
      .select("*, marketing_request_items(product_name, qty)")
      .eq("id", requestId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!canBookWithBiteship(pkg)) {
      return NextResponse.json(
        { error: "This request cannot be booked with Biteship." },
        { status: 400 }
      );
    }

    const destinationPostalCode = parsePostalCode(pkg.postal_code);
    if (!destinationPostalCode) {
      return NextResponse.json(
        { error: "Recipient postal code must be a valid 5-digit Indonesia postal code." },
        { status: 400 }
      );
    }

    const weightGrams = Math.max(100, Math.min(body.weightGrams ?? 500, 50_000));
    const lengthCm = Math.max(1, Math.min(body.lengthCm ?? 25, 200));
    const widthCm = Math.max(1, Math.min(body.widthCm ?? 20, 200));
    const heightCm = Math.max(1, Math.min(body.heightCm ?? 15, 200));
    const valueIdr = Math.max(1_000, Math.min(body.valueIdr ?? 100_000, 50_000_000));

    const items = (pkg.marketing_request_items ?? []) as Array<{
      product_name: string;
      qty: number;
    }>;

    const order = await createBiteshipOrder({
      referenceId: pkg.barcode,
      destination: {
        contactName: pkg.recipient_name,
        contactPhone: pkg.recipient_phone,
        postalCode: destinationPostalCode,
        addressLine1: pkg.address_line1,
        addressLine2: pkg.address_line2,
        city: pkg.city,
        state: pkg.state,
        note: pkg.notes,
      },
      courierCompany,
      courierType,
      items,
      package: { weightGrams, lengthCm, widthCm, heightCm, valueIdr },
      orderNote: pkg.notes ? `MK ${pkg.barcode} — ${pkg.notes}` : `MK ${pkg.barcode}`,
    });

    const bookedAt = new Date().toISOString();
    const trackingLabel = order.trackingId?.trim() || null;

    const { data: updated, error: updateError } = await supabase
      .from("marketing_requests")
      .update({
        biteship_order_id: order.orderId,
        biteship_courier_company: order.courierCompany,
        biteship_courier_type: order.courierType,
        biteship_waybill_url: order.waybillUrl,
        biteship_status: order.status,
        actual_shipping_label: trackingLabel,
        actual_shipping_label_at: trackingLabel ? bookedAt : null,
        actual_shipping_label_by: trackingLabel ? initials : null,
      })
      .eq("id", requestId)
      .eq("status", "packed")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        {
          error:
            "Biteship order was created but the portal could not be updated. Contact ops with order ID: " +
            order.orderId,
          biteshipOrderId: order.orderId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
      bookedAt,
      bookedBy: initials,
    });
  } catch (err: unknown) {
    console.error("biteship order error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create Biteship order" },
      { status: 500 }
    );
  }
}
