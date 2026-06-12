import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isLarkConfigured, sendLarkMarketingChat } from "../../../../lib/larkNotify";
import { supabase } from "../../../../lib/supabaseClient";
import { mentionHandleFromEmail, parseMentionedEmails } from "../../../../lib/marketingMentions";
import { canFulfill, normalizeUserRole } from "../../../../lib/marketingRoles";
import type { MarketingChatParticipant } from "../../../../types/marketing";

const resend = new Resend(process.env.RESEND_API_KEY);

function hasEmailNotifications(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.length > 3;
}

function participantLabel(email: string, participants: MarketingChatParticipant[]): string {
  const participant = participants.find((p) => normalizeEmail(p.email) === email);
  return participant ? `${participant.display_name} (@${participant.handle})` : email;
}

export async function POST(request: Request) {
  if (!hasEmailNotifications() && !isLarkConfigured()) {
    return NextResponse.json({ error: "No notification channel configured" }, { status: 503 });
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
      .select("barcode, recipient_name, status, requested_by_name, requested_by_email, request_purpose")
      .eq("id", message.request_id)
      .maybeSingle();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const { data: users } = await supabase
      .from("marketing_users")
      .select("email, display_name, role, division")
      .eq("active", true);

    const participants: MarketingChatParticipant[] = (users ?? []).map((u) => ({
      email: u.email,
      display_name: u.display_name,
      role: normalizeUserRole(u.role),
      division: (u.division?.trim() || "Other") as MarketingChatParticipant["division"],
      handle: mentionHandleFromEmail(u.email),
    }));
    const roleByEmail = new Map(
      participants.map((p) => [normalizeEmail(p.email), p.role])
    );

    const authorEmail = normalizeEmail(message.author_email);
    const requesterEmail = normalizeEmail(pkg.requested_by_email);
    const mentionedEmails = parseMentionedEmails(message.body, participants, message.author_email).map(
      normalizeEmail
    );

    const recipients = new Set<string>();

    if (authorEmail !== requesterEmail && isValidEmail(requesterEmail)) {
      recipients.add(requesterEmail);
    }

    for (const email of mentionedEmails) {
      if (email !== authorEmail && isValidEmail(email)) {
        recipients.add(email);
      }
    }

    const shouldNotify = recipients.size > 0 || mentionedEmails.length > 0;
    if (!shouldNotify) {
      return NextResponse.json({ success: true, emailed: 0, larkSent: false });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const marketingUrl = `${siteUrl}/marketing`;
    const fulfillUrl = `${siteUrl}/marketing/fulfill`;
    const purposeLine = `Event / purpose: ${pkg.request_purpose?.trim() || "—"}`;

    const packageBlock = [
      `Package barcode: ${pkg.barcode}`,
      `Recipient: ${pkg.recipient_name}`,
      purposeLine,
      `Status: ${pkg.status}`,
      `Requested by: ${pkg.requested_by_name}`,
      "",
      "Message:",
      `"${message.body}"`,
    ].join("\n");

    let larkSent = false;
    if (isLarkConfigured()) {
      try {
        const notifiedLabels =
          mentionedEmails.length > 0
            ? mentionedEmails.map((email) => participantLabel(email, participants))
            : [...recipients].map((email) => participantLabel(email, participants));

        const purpose = pkg.request_purpose?.trim() || "—";
        await sendLarkMarketingChat({
          barcode: pkg.barcode,
          status: pkg.status,
          recipientName: pkg.recipient_name,
          purpose,
          requestedByName: pkg.requested_by_name,
          authorName: message.author_name,
          notifiedLabels,
          messageBody: message.body,
          dashboardUrl: marketingUrl,
        });
        larkSent = true;
      } catch (larkErr) {
        console.error("marketing-chat Lark notify error:", larkErr);
      }
    }

    let emailed = 0;

    for (const to of recipients) {
      if (!isValidEmail(to)) continue;

      const isRequester = to === requesterEmail;
      const wasMentioned = mentionedEmails.includes(to);
      const openUrl = canFulfill({
        email: to,
        displayName: "",
        role: roleByEmail.get(to) ?? "requester",
        division: "Other",
      })
        ? fulfillUrl
        : marketingUrl;

      let subject: string;
      let intro: string;

      if (isRequester && wasMentioned) {
        subject = `[Aeris] ${message.author_name} replied on your request — ${pkg.recipient_name} (${pkg.barcode})`;
        intro = `${message.author_name} mentioned you in the discussion for your marketing request:`;
      } else if (isRequester) {
        subject = `[Aeris] New message on your request — ${pkg.recipient_name} (${pkg.barcode})`;
        intro = `${message.author_name} posted in the discussion for your marketing request:`;
      } else {
        subject = `[Aeris] ${message.author_name} mentioned you — ${pkg.recipient_name} (${pkg.barcode})`;
        intro = `${message.author_name} mentioned you in a package discussion:`;
      }

      const text = [intro, "", packageBlock, "", `Open the dashboard to reply: ${openUrl}`].join("\n");

      if (hasEmailNotifications()) {
        try {
          await resend.emails.send({
            from: "Aeris Fulfillment <offlinesalesreports@aerisbeaute.com>",
            to: [to],
            subject,
            text,
          });
          emailed += 1;
        } catch (emailErr) {
          console.error(`marketing-chat email notify error for ${to}:`, emailErr);
        }
      }
    }

    return NextResponse.json({ success: true, emailed, larkSent });
  } catch (err: unknown) {
    console.error("marketing-chat notify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send notification emails" },
      { status: 500 }
    );
  }
}
