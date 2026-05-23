/** Sociolla PO line extracted from Purchase Order Confirmation PDF text. */
export interface SociollaPoLine {
  sociollaSku: string;
  description: string;
  quantity: number;
}

export interface SociollaParsedPo {
  poNumber: string;
  retailerName: string;
  poDate: string;
  deliveryDate: string;
  lines: SociollaPoLine[];
  totalQuantity: number;
}

const SKU_IN_BRACKETS = /\[(AEB\.[^\]]+)\]/;
/** Qty may be on its own line or trailing the description line before "Units". */
const LINE_ITEM_BLOCK =
  /\[(AEB\.[^\]]+)\]([\s\S]*?)(?:[\s\t]+(\d+)\s*\n\s*|\n(\d+)\s*\n\s*)Units/g;

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Normalize duplicated PDF columns (e.g. "Description\nDescription"). */
export function normalizeSociollaPdfText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^=== PAGE \d+ ===\s*/gm, "")
    .replace(/\r\n/g, "\n");
}

export function extractSociollaPoNumber(text: string): string {
  const full = text.match(/#\s*(PO\/SRI\/\d{4}\/\d{5,})/i);
  if (full) return full[1].trim();

  const inline = text.match(/PO\/SRI\/\d{4}\/\d{5,}/i);
  if (inline) return inline[0].trim();

  const split = text.match(/PO\/SRI\/(\d{4})\/(\d+)\s*\n\s*(\d+)/i);
  if (split) return `PO/SRI/${split[1]}/${split[2]}${split[3]}`;

  return "";
}

function parseSociollaDate(raw: string): string {
  const trimmed = raw.trim();
  const dmy = trimmed.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (dmy) {
    const month = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (month) return `${dmy[3]}-${month}-${dmy[1].padStart(2, "0")}`;
  }
  return trimmed || "N/A";
}

function extractLabeledValue(text: string, label: string): string {
  const re = new RegExp(`${label}\\s*:?\\s*\\n?\\s*([^\\n]+)`, "i");
  const match = text.match(re);
  return match ? match[1].trim() : "";
}

function extractScheduleDate(text: string): string {
  const re = /Schedule Date\s*\n\s*Schedule Date\s*\n\s*([^\n]+)/i;
  const match = text.match(re);
  return match ? parseSociollaDate(match[1]) : "";
}

export function parseSociollaPoLines(text: string): SociollaPoLine[] {
  const lines: SociollaPoLine[] = [];
  const normalized = normalizeSociollaPdfText(text);

  for (const match of normalized.matchAll(LINE_ITEM_BLOCK)) {
    const sociollaSku = match[1].trim();
    const description = collapseWhitespace(match[2]);
    const quantity = parseInt(match[3] || match[4], 10);

    if (!SKU_IN_BRACKETS.test(`[${sociollaSku}]`) || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    lines.push({ sociollaSku, description, quantity });
  }

  return lines;
}

export function parseSociollaPoText(raw: string): SociollaParsedPo {
  const text = normalizeSociollaPdfText(raw);
  const poNumber = extractSociollaPoNumber(text);

  if (!poNumber) {
    throw new Error("Could not find Sociolla PO number (expected PO/SRI/YYYY/…).");
  }

  const lines = parseSociollaPoLines(text);
  if (lines.length === 0) {
    throw new Error("No line items found. SKUs must appear in [AEB.…] brackets with a quantity in Units.");
  }

  const orderDateRaw = extractLabeledValue(text, "Order Date");
  const scheduleDate = extractScheduleDate(text) || extractLabeledValue(text, "Schedule Date");

  return {
    poNumber,
    retailerName: "Sociolla",
    poDate: parseSociollaDate(orderDateRaw),
    deliveryDate: scheduleDate || "N/A",
    lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}
