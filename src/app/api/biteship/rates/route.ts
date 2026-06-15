import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";
import {
  fetchBiteshipRates,
  getBiteshipConfig,
  isBiteshipConfigured,
  parsePostalCode,
} from "../../../../lib/biteship";
import { canBookWithBiteship } from "../../../../types/marketing";

export async function GET() {
  return NextResponse.json({
    configured: isBiteshipConfigured(),
    originPostalCode: isBiteshipConfigured()
      ? getBiteshipConfig().originPostalCode
      : null,
  });
}

export async function POST(request: Request) {
  if (!isBiteshipConfigured()) {
    return NextResponse.json({ error: "Biteship is not configured on this server." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      requestId?: string;
      weightGrams?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      valueIdr?: number;
    };

    const { requestId } = body;
    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
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
        { error: "This request cannot be booked with Biteship (must be packed, Indonesia, domestic courier)." },
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

    const rates = await fetchBiteshipRates({
      destinationPostalCode,
      preferredCourier: pkg.preferred_courier,
      items,
      package: { weightGrams, lengthCm, widthCm, heightCm, valueIdr },
    });

    if (rates.length === 0) {
      return NextResponse.json(
        { error: "No courier rates available for this destination. Check postal code and package size." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      rates,
      package: { weightGrams, lengthCm, widthCm, heightCm, valueIdr },
    });
  } catch (err: unknown) {
    console.error("biteship rates error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Biteship rates" },
      { status: 500 }
    );
  }
}
