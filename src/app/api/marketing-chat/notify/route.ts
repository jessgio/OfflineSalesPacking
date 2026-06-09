import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabase } from "../../../../lib/supabaseClient";
import { mentionHandleFromEmail, parseMentionedEmails } from "../../../../lib/marketingMentions";
import type { MarketingChatParticipant } from "../../../../types/marketing";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  try {
    const { messageId } = (await request.json()) as { messageId?: string };
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const { data: message, error: messageError } = await supabase
      .from("marketing_request_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError || !message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { data: pkg, error: pkgError } = await supabase
      .from("marketing_requests")
      .select("barcode, recipient_name, status, requested_by_name")
      .eq("id", message.request_id)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const { data: users } = await supabase
      .from("marketing_users")
      .select("email, display_name, role")
      .eq("active", true);

    const participants: MarketingChatParticipant[] = (users ?? []).map((u) => ({
      email: u.email,
      display_name: u.display_name,
      role: u.role,
      handle: mentionHandleFromEmail(u.email),
    }));

    const mentionedEmails = parseMentionedEmails(message.body, participants, message.author_email);
    if (mentionedEmails.length === 0) {
      return NextResponse.json({ success: true, emailed: 0 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const threadUrl =
      message.author_role === "admin"
        ? `${siteUrl}/marketing/fulfill`
        : `${siteUrl}/marketing`;

    const subject = `[Aeris] ${message.author_name} mentioned you — ${pkg.recipient_name} (${pkg.barcode})`;
    const text = [
      `${message.author_name} mentioned you in a package discussion:`,
      "",
      `Package barcode: ${pkg.barcode}`,
      `Recipient: ${pkg.recipient_name}`,
      `Status: ${pkg.status}`,
      `Requested by: ${pkg.requested_by_name}`,
      "",
      "Message:",
      `"${message.body}"`,
      "",
      `Open the dashboard to reply: ${threadUrl}`,
    ].join("\n");

    await resend.emails.send({
      from: "Aeris Fulfillment <offlinesalesreports@aerisbeaute.com>",
      to: mentionedEmails,
      subject,
      text,
    });

    return NextResponse.json({ success: true, emailed: mentionedEmails.length });
  } catch (err: unknown) {
    console.error("marketing-chat notify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send mention emails" },
      { status: 500 }
    );
  }
}
