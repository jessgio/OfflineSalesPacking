import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { parseSociollaPoText } from "../../../../lib/sociolla/sociollaPoParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Sociolla uploads must be PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    await parser.destroy();
    parser = null;

    if (!text?.trim()) {
      return NextResponse.json({ error: "Could not read text from PDF." }, { status: 422 });
    }

    const parsed = parseSociollaPoText(text);
    return NextResponse.json(parsed);
  } catch (error) {
    if (parser) await parser.destroy().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Failed to parse Sociolla PO.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
