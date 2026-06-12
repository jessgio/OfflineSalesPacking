import crypto from "crypto";

const LARK_TEXT_MAX_LENGTH = 4000;

type LarkWebhookPayload = {
  msg_type: string;
  content?: Record<string, unknown>;
  card?: LarkCard;
  timestamp?: string;
  sign?: string;
};

type LarkPlainText = { tag: "plain_text"; content: string };
type LarkMarkdown = { tag: "lark_md"; content: string };

type LarkCardElement =
  | { tag: "div"; text: LarkMarkdown }
  | { tag: "hr" }
  | {
      tag: "action";
      actions: Array<{
        tag: "button";
        text: LarkPlainText;
        url: string;
        type: "primary" | "default";
      }>;
    };

type LarkCard = {
  config?: { wide_screen_mode: boolean };
  header?: {
    template?: "blue" | "wathet" | "turquoise" | "green" | "yellow" | "orange" | "red" | "carmine" | "violet" | "purple" | "indigo" | "grey";
    title: LarkPlainText;
  };
  elements: LarkCardElement[];
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

/** Escape user content embedded in lark_md so markdown stays valid. */
function escapeLarkMd(text: string): string {
  return text.replace(/([\\`*_\[\]()#+\-.!|>{}])/g, "\\$1");
}

function mdField(label: string, value: string): string {
  return `**${label}:** ${escapeLarkMd(value)}`;
}

function mdLines(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
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

  const data = (await res.json()) as { StatusCode?: number; msg?: string; code?: number };
  if (data.StatusCode !== 0 && data.code !== 0) {
    throw new Error(data.msg ?? "Lark webhook returned non-zero StatusCode");
  }
}

async function sendLarkCard(card: LarkCard): Promise<void> {
  await sendLarkWebhook({
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      ...card,
    },
  });
}

function dashboardButton(url: string, label = "Open dashboard"): LarkCardElement {
  return {
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: label },
        url,
        type: "primary",
      },
    ],
  };
}

/** Join non-empty lines with a single newline — no blank gaps between fields. */
export function formatLarkMessage(lines: Array<string | null | undefined | false>): string {
  return lines
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function sendLarkMarketingChat(params: {
  barcode: string;
  status: string;
  recipientName: string;
  purpose: string;
  requestedByName: string;
  authorName: string;
  notifiedLabels: string[];
  messageBody: string;
  dashboardUrl: string;
}): Promise<void> {
  const message = truncateText(params.messageBody.trim());

  await sendLarkCard({
    header: {
      template: "purple",
      title: {
        tag: "plain_text",
        content: `Marketing chat — ${params.barcode}`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: mdLines([
            mdField("Status", params.status),
            mdField("Recipient", params.recipientName),
            mdField("Purpose", params.purpose),
            mdField("Requested by", params.requestedByName),
            mdField("From", params.authorName),
            mdField("Notified", params.notifiedLabels.join(", ") || "—"),
          ]),
        },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Message**\n${escapeLarkMd(message)}`,
        },
      },
      dashboardButton(params.dashboardUrl),
    ],
  });
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
  await sendLarkCard({
    header: {
      template: "green",
      title: {
        tag: "plain_text",
        content: `Package shipped — ${params.barcode}`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: mdLines([
            mdField("Status", params.status),
            mdField("Recipient", params.recipientName),
            mdField("Purpose", params.purpose),
            mdField("Requested by", params.requestedByName),
            mdField("Shipped by", params.shippedBy),
          ]),
        },
      },
      dashboardButton(params.dashboardUrl),
    ],
  });
}

function dailySummaryLineToMd(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  if (/warning/i.test(trimmed)) {
    return `**${escapeLarkMd(trimmed)}**`;
  }

  const statusMatch = trimmed.match(/^(.*\bStatus:\s*)(.+)$/i);
  if (statusMatch) {
    return `${escapeLarkMd(statusMatch[1])}**${escapeLarkMd(statusMatch[2])}**`;
  }

  const poMatch = trimmed.match(/^(.*\bPO\s*Number:\s*)(.+)$/i);
  if (poMatch) {
    return `${escapeLarkMd(poMatch[1])}**${escapeLarkMd(poMatch[2])}**`;
  }

  const deadlineMatch = trimmed.match(/^(.*\bDeadline:\s*)(.+)$/i);
  if (deadlineMatch) {
    return `${escapeLarkMd(deadlineMatch[1])}**${escapeLarkMd(deadlineMatch[2])}**`;
  }

  return escapeLarkMd(trimmed);
}

export async function sendLarkDailySummary(title: string, body: string): Promise<void> {
  const summary = truncateText(body.trim());
  const lines =
    summary.length > 0 ? summary.split("\n") : ["Report generation failed."];

  await sendLarkCard({
    header: {
      template: "blue",
      title: { tag: "plain_text", content: title },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: lines.map(dailySummaryLineToMd).filter(Boolean).join("\n"),
        },
      },
    ],
  });
}

export async function sendLarkText(text: string): Promise<void> {
  await sendLarkWebhook({
    msg_type: "text",
    content: { text: truncateText(text) },
  });
}
