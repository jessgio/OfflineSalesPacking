import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";
import OpenAI from "openai";
import { Resend } from "resend";

// OPENROUTER CONFIGURATION
const openai = new OpenAI({ 
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://aerisbeaute.com",
    "X-Title": "Aeris WMS Dashboard"
  }
});

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("*")
      .in("status", ["Not Started", "Packing", "Partial Fulfillment"]);

    if (!pos || pos.length === 0) {
      return NextResponse.json({ message: "No active POs to report." });
    }

    const activePoIds = pos.map(p => p.id);
    const { data: items } = await supabase
      .from("po_items")
      .select("*")
      .in("po_id", activePoIds);

    let rawDataDump = "CURRENT WAREHOUSE STATUS:\n\n";
    pos.forEach(po => {
      const poItems = items?.filter(i => i.po_id === po.id) || [];
      const totalUnits = poItems.reduce((sum, i) => sum + i.target_qty, 0);
      const packedUnits = poItems.reduce((sum, i) => sum + i.scanned_qty, 0);
      const shortages = poItems.filter(i => i.is_short).length;
      
      rawDataDump += `- PO Number: ${po.po_number}\n`;
      rawDataDump += `  Retailer: ${po.retailer_name}\n`;
      rawDataDump += `  Deadline: ${po.delivery_date}\n`;
      rawDataDump += `  Status: ${po.status}\n`;
      rawDataDump += `  Overall Progress: ${packedUnits} out of ${totalUnits} units packed.\n`;
      if (shortages > 0) rawDataDump += `  WARNING: ${shortages} SKUs have been marked as short/out-of-stock.\n`;
      rawDataDump += `\n`;
    });

    const aiResponse = await openai.chat.completions.create({
      model: "openai/gpt-4o", // OpenRouter format! You can also swap to "anthropic/claude-3-haiku"
      messages: [
        {
          role: "system",
          content: "You are the AI Warehouse Manager for Aeris Beaute. Analyze the provided raw warehouse data and write a short, punchy, executive email to the Head of Fulfillment. Highlight what is on track, warn them about impending deadlines, and explicitly call out any inventory shortages."
        },
        {
          role: "user",
          content: rawDataDump
        }
      ],
    });

    const aiSummary = aiResponse.choices[0].message.content;

    await resend.emails.send({
      from: "Aeris AI System <offlinesalesreports@aerisbeaute.com>", 
      to: process.env.MANAGER_EMAIL as string, 
      subject: "📦 Daily Fulfillment Report - Aeris Beaute",
      text: aiSummary || "Report generation failed.",
    });

    return NextResponse.json({ success: true, message: "AI Summary generated and emailed." });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}