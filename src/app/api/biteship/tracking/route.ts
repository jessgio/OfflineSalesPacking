import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import { isBiteshipConfigured, resolveBiteshipTracking } from "../../../../lib/biteship";
import { canTrackWithBiteship } from "../../../../types/marketing";

export async function GET(request: Request) {
  if (!isBiteshipConfigured()) {
    return NextResponse.json({ error: "Biteship is not configured on this server." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("requestId")?.trim();

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  try {
    const { data: pkg, error: pkgError } = await supabase
      .from("marketing_requests")
      .select(
        "id, barcode, biteship_order_id, biteship_courier_company, actual_shipping_label, biteship_status, biteship_status_updated_at"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!canTrackWithBiteship(pkg)) {
      return NextResponse.json(
        { error: "This shipment does not have Biteship tracking data yet." },
        { status: 400 }
      );
    }

    const tracking = await resolveBiteshipTracking({
      orderId: pkg.biteship_order_id,
      waybillId: pkg.actual_shipping_label,
      courierCompany: pkg.biteship_courier_company,
    });

    return NextResponse.json({
      requestId: pkg.id,
      barcode: pkg.barcode,
      cachedStatus: pkg.biteship_status,
      cachedStatusUpdatedAt: pkg.biteship_status_updated_at,
      tracking,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("biteship tracking error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Biteship tracking" },
      { status: 500 }
    );
  }
}
