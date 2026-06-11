import crypto from "crypto";

const LARK_TEXT_MAX_LENGTH = 4000;

type LarkTextPayload = {
  msg_type: "text";
  content: { text: string };
  timestamp?: string;
  sign?: string;
};

function signPayload(timestamp: string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

export function isLarkConfigured(): boolean {
  return (
    process.env.LARK_NOTIFICATIONS_ENABLED === "true" && !!process.env.LARK_WEBHOOK_URL
  );
}

function truncateText(text: string): string {
  if (text.length <= LARK_TEXT_MAX_LENGTH) return text;
  return `${text.slice(0, LARK_TEXT_MAX_LENGTH - 1)}…`;
}

export async function sendLarkText(text: string): Promise<void> {
  const webhook = process.env.LARK_WEBHOOK_URL;
  if (!isLarkConfigured() || !webhook) return;

  const body: LarkTextPayload = {
    msg_type: "text",
    content: { text: truncateText(text) },
  };

  const secret = process.env.LARK_WEBHOOK_SECRET;
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = signPayload(timestamp, secret);
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lark webhook failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { StatusCode?: number; msg?: string };
  if (data.StatusCode !== 0) {
    throw new Error(data.msg ?? "Lark webhook returned non-zero StatusCode");
  }
}
