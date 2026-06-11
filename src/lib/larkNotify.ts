import crypto from "crypto";

const LARK_TEXT_MAX_LENGTH = 4000;
const LARK_POST_LOCALE = "en_us";

type LarkWebhookPayload = {
  msg_type: string;
  content: Record<string, unknown>;
  timestamp?: string;
  sign?: string;
};

type LarkPostTextElement = {
  tag: "text";
  text: string;
  style?: Array<"bold" | "underline" | "lineThrough" | "italic">;
};

type LarkPostLine = LarkPostTextElement[];

type LarkLinePart = { text: string; bold?: boolean };

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

function larkTextLine(text: string, style?: LarkPostTextElement["style"]): LarkPostLine {
  const element: LarkPostTextElement = { tag: "text", text };
  if (style?.length) element.style = style;
  return [element];
}

function larkMixedLine(parts: LarkLinePart[]): LarkPostLine {
  return parts.map(({ text, bold }) => {
    const element: LarkPostTextElement = { tag: "text", text };
    if (bold) element.style = ["bold"];
    return element;
  });
}

async function sendLarkWebhook(payload: LarkWebhookPayload): Promise<void> {
  const webhook = process.env.LARK_WEBHOOK_URL;
  if (!isLarkConfigured() || !webhook) return;

  const body: LarkWebhookPayload = { ...payload };

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

async function sendLarkPost(content: LarkPostLine[]): Promise<void> {
  await sendLarkWebhook({
    msg_type: "post",
    content: {
      post: {
        [LARK_POST_LOCALE]: {
          title: "",
          content,
        },
      },
    },
  });
}

/** Join non-empty lines with a single newline — no blank gaps between fields. */
export function formatLarkMessage(lines: Array<string | null | undefined | false>): string {
  return lines
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** Rich post: compact header/footer with a bold message sandwiched between blank lines. */
export async function sendLarkMarketingChat(
  headerLines: string[],
  body: string,
  footerLine: string
): Promise<void> {
  const message = truncateText(body.trim());
  const messageLines = message.length > 0 ? message.split("\n") : [" "];

  await sendLarkPost([
    ...headerLines.filter((line) => line.trim()).map((line) => larkTextLine(line)),
    larkTextLine(""),
    ...messageLines.map((line) => larkTextLine(line || " ", ["bold"])),
    larkTextLine(""),
    larkTextLine(footerLine.trim()),
  ]);
}

export async function sendLarkShippedAlert(params: {
  barcode: string;
  status: string;
  recipientName: string;
  purpose: string;
  requestedByName: string;
  shippedBy: string;
  dashboardUrl: string;
}): Promise<void> {
  await sendLarkPost([
    larkMixedLine([
      { text: "🚚 Package shipped — " },
      { text: params.barcode, bold: true },
      { text: " · Status: " },
      { text: params.status, bold: true },
    ]),
    larkMixedLine([
      { text: "Recipient: " },
      { text: params.recipientName, bold: true },
      { text: " · Purpose: " },
      { text: params.purpose },
    ]),
    larkMixedLine([
      { text: "Requested by: " },
      { text: params.requestedByName },
      { text: " · Shipped by: " },
      { text: params.shippedBy, bold: true },
    ]),
    larkTextLine(`Dashboard: ${params.dashboardUrl}`),
  ]);
}

function larkDailySummaryLine(line: string): LarkPostLine {
  const trimmed = line.trim();
  if (!trimmed) return larkTextLine("");

  if (/warning/i.test(trimmed)) {
    return larkTextLine(trimmed, ["bold"]);
  }

  const statusMatch = trimmed.match(/^(.*\bStatus:\s*)(.+)$/i);
  if (statusMatch) {
    return larkMixedLine([
      { text: statusMatch[1] },
      { text: statusMatch[2], bold: true },
    ]);
  }

  const poMatch = trimmed.match(/^(.*\bPO\s*Number:\s*)(.+)$/i);
  if (poMatch) {
    return larkMixedLine([
      { text: poMatch[1] },
      { text: poMatch[2], bold: true },
    ]);
  }

  const deadlineMatch = trimmed.match(/^(.*\bDeadline:\s*)(.+)$/i);
  if (deadlineMatch) {
    return larkMixedLine([
      { text: deadlineMatch[1] },
      { text: deadlineMatch[2], bold: true },
    ]);
  }

  return larkTextLine(trimmed);
}

export async function sendLarkDailySummary(title: string, body: string): Promise<void> {
  const summary = truncateText(body.trim());
  const lines = summary.length > 0 ? summary.split("\n") : ["Report generation failed."];

  await sendLarkPost([
    larkTextLine(title, ["bold"]),
    larkTextLine(""),
    ...lines.map(larkDailySummaryLine),
  ]);
}

export async function sendLarkText(text: string): Promise<void> {
  await sendLarkWebhook({
    msg_type: "text",
    content: { text: truncateText(text) },
  });
}
