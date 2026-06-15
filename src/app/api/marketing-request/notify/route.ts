import { NextResponse } from "next/server";
import { isLarkConfigured, sendLarkNewRequestAlert } from "../../../../lib/larkNotify";
import { supabase } from "../../../../lib/supabaseClient";

function formatItemSummary(
  items: Array<{ product_name: string; qty: number }> | null | undefined
): string {
  if (!items?.length) return "—";
  const summary = items.map((item) => `${item.product_name.trim()} ×${item.qty}`).join(", ");
  return summary.length > 200 ? `${summary.slice(0, 199)}…` : summary;
}

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
        "barcode, recipient_name, requested_by_name, requested_by_division, request_purpose, due_date, preferred_courier, status, marketing_request_items(product_name, qty)"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (pkg.status !== "pending") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const fulfillUrl = `${siteUrl}/marketing/fulfill`;
    const purpose = pkg.request_purpose?.trim() || "—";
    const items = (pkg.marketing_request_items ?? []) as Array<{
      product_name: string;
      qty: number;
    }>;

    let larkSent = false;
    try {
      await sendLarkNewRequestAlert({
        barcode: pkg.barcode,
        recipientName: pkg.recipient_name,
        purpose,
        requestedByName: pkg.requested_by_name,
        requestedByDivision: pkg.requested_by_division?.trim() || "—",
        dueDate: formatDueDate(pkg.due_date),
        preferredCourier: pkg.preferred_courier?.trim() || "—",
        itemSummary: formatItemSummary(items),
        dashboardUrl: fulfillUrl,
      });
      larkSent = true;
    } catch (larkErr) {
      console.error("marketing-request Lark notify error:", larkErr);
    }

    return NextResponse.json({ success: true, larkSent });
  } catch (err: unknown) {
    console.error("marketing-request notify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send new request notification" },
      { status: 500 }
    );
  }
}
