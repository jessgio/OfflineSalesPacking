import { NextResponse } from "next/server";
import { isLarkConfigured, sendLarkDailySummary } from "../../../lib/larkNotify";
import { getSiteUrl } from "../../../lib/siteUrl";
import { supabase } from "../../../lib/supabaseClient";
import OpenAI from "openai";
import { Resend } from "resend";

// OPENROUTER CONFIGURATION
const openai = new OpenAI({ 
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": getSiteUrl(),
    "X-Title": "Aeris WMS Dashboard"
  }
});

const resend = new Resend(process.env.RESEND_API_KEY);

/** Paused — set to true and restore the vercel.json cron (`0 17 * * *` → `/api/daily-summary`) to resume. */
const DAILY_FULFILLMENT_REPORTS_ENABLED = false;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DAILY_FULFILLMENT_REPORTS_ENABLED) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Daily fulfillment reports are paused (email and Lark).",
    });
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
          content: "You are the AI Warehouse Manager for Aeris Beaute. Analyze the provided raw warehouse data and write a report that highlights what is on track, as well as what has impending deadlines and has not yet been packed."
        },
        {
          role: "user",
          content: rawDataDump
        }
      ],
    });

    const aiSummary = aiResponse.choices[0].message.content ?? "Report generation failed.";
    const reportSubject = "📦 Daily Fulfillment Report - Aeris Beaute";

    if (process.env.RESEND_API_KEY && process.env.MANAGER_EMAIL) {
      await resend.emails.send({
        from: "Aeris AI System <offlinesalesreports@aerisbeaute.com>",
        to: process.env.MANAGER_EMAIL,
        subject: reportSubject,
        text: aiSummary,
      });
    }

    let larkSent = false;
    if (isLarkConfigured()) {
      try {
        await sendLarkDailySummary(reportSubject, aiSummary);
        larkSent = true;
      } catch (larkErr) {
        console.error("daily-summary Lark notify error:", larkErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "AI Summary generated.",
      larkSent,
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}