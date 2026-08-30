import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSiteUrl } from "../../../../lib/siteUrl";
import { supabase } from "../../../../lib/supabaseClient";

const resend = new Resend(process.env.RESEND_API_KEY);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const SUCCESS_MESSAGE = "If that email is registered, we sent your PIN.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = normalizeEmail(body.email ?? "");

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email delivery is not configured. Contact ops for your PIN." },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from("marketing_users")
      .select("email, display_name, pin")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    if (!error && data) {
      const siteUrl = getSiteUrl(request);
      const text = [
        `Hi ${data.display_name},`,
        "",
        "You requested a reminder of your Aeris marketing portal PIN.",
        "",
        `Your PIN: ${data.pin}`,
        "",
        `Sign in at: ${siteUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n");

      try {
        await resend.emails.send({
          from: "Aeris Fulfillment <offlinesalesreports@aerisbeaute.com>",
          to: [data.email],
          subject: "[Aeris] Your marketing portal PIN",
          text,
        });
      } catch (emailErr) {
        console.error("marketing-auth send-pin email error:", emailErr);
        return NextResponse.json(
          { error: "Could not send email. Try again or contact ops." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: SUCCESS_MESSAGE });
  } catch (err: unknown) {
    console.error("marketing-auth send-pin error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process request" },
      { status: 500 }
    );
  }
}
