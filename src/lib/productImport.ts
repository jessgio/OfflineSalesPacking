import type { ProductRow } from "./productsDb";

export const PRODUCT_IMPORT_HEADERS = [
  "barcode",
  "clean_name",
  "rsp",
  "sociolla_sku",
] as const;

export const PRODUCT_IMPORT_TEMPLATE_ROWS: string[][] = [
  ["8801234567890", "Lip Gloss Rose", "189000", "AEB.LG-ROSE01"],
  ["8801234567891", "Face Serum 30ml", "425000", ""],
  ["8801234567892", "Body Lotion", "156000", ""],
];

const HEADER_ALIASES: Record<string, string[]> = {
  barcode: ["barcode", "product_barcode", "upc", "ean", "sku"],
  clean_name: ["clean_name", "cleanname", "product_name", "productname", "name"],
  rsp: ["rsp", "retail_price", "retailprice", "retail_selling_price", "price", "harga"],
  sociolla_sku: ["sociolla_sku", "sociollasku", "retailer_sku"],
};

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let curr = "";
  let inQuotes = false;

  const cleaned = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const next = cleaned[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      curr += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(curr.trim());
      curr = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(curr.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      curr = "";
    } else {
      curr += char;
    }
  }

  row.push(curr.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function mapHeaders(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headerRow.map(normalizeHeader);

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[canonical] = idx;
  }

  return map;
}

function parseRsp(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildProductImportTemplateCsv(): string {
  const lines = [
    PRODUCT_IMPORT_HEADERS.join(","),
    ...PRODUCT_IMPORT_TEMPLATE_ROWS.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadProductImportTemplate(): void {
  const blob = new Blob([buildProductImportTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "product-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ProductImportParseResult {
  products: ProductRow[];
  errors: string[];
}

export function parseProductImportCsv(text: string): ProductImportParseResult {
  const grid = parseCsvGrid(text);
  const errors: string[] = [];

  if (grid.length < 2) {
    return { products: [], errors: ["File is empty or has no data rows."] };
  }

  const col = mapHeaders(grid[0]);
  const required = ["barcode", "clean_name"] as const;

  for (const key of required) {
    if (col[key] === undefined) {
      errors.push(`Missing required column: ${key.replace(/_/g, " ")}`);
    }
  }

  if (errors.length > 0) {
    return { products: [], errors };
  }

  const products: ProductRow[] = [];
  const seenBarcodes = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const rowNum = r + 1;
    const cell = (key: string) => (row[col[key]] ?? "").trim();

    const barcode = cell("barcode");
    const cleanName = cell("clean_name");

    if (!barcode) {
      errors.push(`Row ${rowNum}: barcode is required.`);
      continue;
    }
    if (!cleanName) {
      errors.push(`Row ${rowNum}: clean_name is required.`);
      continue;
    }
    if (seenBarcodes.has(barcode)) {
      errors.push(`Row ${rowNum}: duplicate barcode "${barcode}" in file.`);
      continue;
    }
    seenBarcodes.add(barcode);

    const rspRaw = col.rsp !== undefined ? cell("rsp") : "";
    const rsp = rspRaw ? parseRsp(rspRaw) : null;
    if (rspRaw && rsp === null) {
      errors.push(`Row ${rowNum}: invalid rsp "${rspRaw}" (use a whole number in IDR).`);
      continue;
    }

    products.push({
      barcode,
      clean_name: cleanName,
      sociolla_sku: cell("sociolla_sku") || null,
      rsp,
    });
  }

  if (errors.length > 0) {
    return { products: [], errors };
  }

  if (products.length === 0) {
    return { products: [], errors: ["No valid product rows found."] };
  }

  return { products, errors: [] };
}
