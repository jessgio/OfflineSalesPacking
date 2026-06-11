import { NextResponse } from "next/server";
import { isLarkConfigured, sendLarkText } from "../../../../lib/larkNotify";
import { supabase } from "../../../../lib/supabaseClient";

export async function POST(request: Request) {
  if (!isLarkConfigured()) {
    return NextResponse.json({ success: true, larkSent: false });
  }

  try {
    const { requestId } = (await request.json()) as { requestId?: string };
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const { data: pkg, error: pkgError } = await supabase
      .from("marketing_requests")
      .select(
        "barcode, recipient_name, status, requested_by_name, request_purpose, shipped_by, shipped_at"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    if (pkg.status !== "shipped") {
      return NextResponse.json({ error: "Package is not shipped" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const marketingUrl = `${siteUrl}/marketing`;
    const purposeLine = `Event / purpose: ${pkg.request_purpose?.trim() || "—"}`;

    let larkSent = false;
    try {
      await sendLarkText(
        [
          `🚚 Package shipped — ${pkg.barcode}`,
          `Recipient: ${pkg.recipient_name}`,
          purposeLine,
          `Requested by: ${pkg.requested_by_name}`,
          `Shipped by: ${pkg.shipped_by ?? "—"}`,
          `Status: ${pkg.status}`,
          "",
          `Dashboard: ${marketingUrl}`,
        ].join("\n")
      );
      larkSent = true;
    } catch (larkErr) {
      console.error("marketing-shipped Lark notify error:", larkErr);
    }

    return NextResponse.json({ success: true, larkSent });
  } catch (err: unknown) {
    console.error("marketing-shipped notify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send shipped notification" },
      { status: 500 }
    );
  }
}
