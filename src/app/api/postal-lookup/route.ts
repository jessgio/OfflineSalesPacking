import { NextResponse } from "next/server";
import { resolvePostalCode } from "../../../lib/postalLookupServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim().toUpperCase();
  const postal = searchParams.get("postal")?.trim();

  if (!country || !postal) {
    return NextResponse.json({ error: "Country and postal code are required." }, { status: 400 });
  }

  const result = await resolvePostalCode(country, postal);

  if (!result) {
    return NextResponse.json({ error: "Postal code not found for this country." }, { status: 404 });
  }

  return NextResponse.json(result);
}
