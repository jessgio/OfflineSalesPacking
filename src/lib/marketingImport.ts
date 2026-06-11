import {
  MARKETING_COURIER_OPTIONS,
  type MarketingCourier,
  type NewMarketingRequestInput,
} from "../types/marketing";

export const MARKETING_IMPORT_HEADERS = [
  "package_id",
  "recipient_name",
  "recipient_phone",
  "due_date",
  "preferred_courier",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "country",
  "notes",
  "request_purpose",
  "product_name",
  "product_barcode",
  "qty",
] as const;

export const MARKETING_IMPORT_TEMPLATE_ROWS: string[][] = [
  [
    "PKG001",
    "Jane Doe",
    "+6591234567",
    "2026-06-15",
    "Regular",
    "123 Orchard Road",
    "#04-01",
    "Singapore",
    "Central Region",
    "238858",
    "Singapore",
    "Gift wrap — fragile items",
    "TikTok creator seeding — Q2 launch",
    "Lip Gloss Rose",
    "8801234567890",
    "2",
  ],
  [
    "PKG001",
    "Jane Doe",
    "+6591234567",
    "2026-06-15",
    "Regular",
    "123 Orchard Road",
    "#04-01",
    "Singapore",
    "Central Region",
    "238858",
    "Singapore",
    "Gift wrap — fragile items",
    "TikTok creator seeding — Q2 launch",
    "Face Serum 30ml",
    "8801234567891",
    "1",
  ],
  [
    "PKG002",
    "John Smith",
    "+6598765432",
    "2026-06-16",
    "Same Day",
    "45 Marina Boulevard",
    "",
    "Singapore",
    "Central Region",
    "018956",
    "Singapore",
    "",
    "Retail pop-up restock",
    "Body Lotion",
    "",
    "1",
  ],
];

const HEADER_ALIASES: Record<string, string[]> = {
  package_id: ["package_id", "packageid", "package", "pkg_id", "pkg"],
  recipient_name: ["recipient_name", "recipientname", "recipient", "name"],
  recipient_phone: ["recipient_phone", "recipientphone", "phone", "mobile", "tel"],
  due_date: ["due_date", "duedate", "due", "delivery_date"],
  preferred_courier: ["preferred_courier", "preferredcourier", "courier", "shipping_method"],
  address_line1: ["address_line1", "addressline1", "address1", "address", "street"],
  address_line2: ["address_line2", "addressline2", "address2", "unit"],
  city: ["city", "town"],
  state: ["state", "region", "province"],
  postal_code: ["postal_code", "postalcode", "postcode", "zip", "zipcode"],
  country: ["country", "nation"],
  notes: ["notes", "note", "instructions", "comments"],
  request_purpose: [
    "request_purpose",
    "requestpurpose",
    "purpose",
    "event",
    "event_purpose",
    "campaign",
  ],
  product_name: ["product_name", "productname", "product", "item", "item_name"],
  product_barcode: ["product_barcode", "productbarcode", "barcode", "sku", "upc"],
  qty: ["qty", "quantity", "amount", "units"],
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

export function buildMarketingImportTemplateCsv(): string {
  const lines = [
    MARKETING_IMPORT_HEADERS.join(","),
    ...MARKETING_IMPORT_TEMPLATE_ROWS.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadMarketingImportTemplate(): void {
  const blob = new Blob([buildMarketingImportTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "marketing-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
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

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const isoLike = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2].padStart(2, "0")}-${isoLike[3].padStart(2, "0")}`;
  }

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  return null;
}

function normalizeCourier(raw: string): MarketingCourier | null {
  const trimmed = raw.trim().toLowerCase();
  return MARKETING_COURIER_OPTIONS.find((o) => o.toLowerCase() === trimmed) ?? null;
}

type PackageDraft = {
  meta: Omit<NewMarketingRequestInput, "items">;
  items: NewMarketingRequestInput["items"];
};

function packageKey(fields: {
  recipient_name: string;
  recipient_phone: string;
  due_date: string;
  preferred_courier: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  notes: string;
  request_purpose: string;
}): string {
  return JSON.stringify(fields);
}

export interface MarketingImportPreviewRow {
  packageId: string;
  recipientName: string;
  itemCount: number;
  dueDate: string;
  courier: string;
  purpose: string | null;
}

export interface MarketingImportParseResult {
  packages: NewMarketingRequestInput[];
  preview: MarketingImportPreviewRow[];
  errors: string[];
}

export function parseMarketingImportCsv(text: string): MarketingImportParseResult {
  const grid = parseCsvGrid(text);
  const errors: string[] = [];

  if (grid.length < 2) {
    return { packages: [], preview: [], errors: ["File is empty or has no data rows."] };
  }

  const col = mapHeaders(grid[0]);
  const required = [
    "package_id",
    "recipient_name",
    "recipient_phone",
    "due_date",
    "preferred_courier",
    "address_line1",
    "city",
    "state",
    "postal_code",
    "country",
    "product_name",
    "qty",
  ] as const;

  for (const key of required) {
    if (col[key] === undefined) {
      errors.push(`Missing required column: ${key.replace(/_/g, " ")}`);
    }
  }

  if (errors.length > 0) {
    return { packages: [], preview: [], errors };
  }

  const byPackageId = new Map<string, PackageDraft>();
  const metaByPackageId = new Map<string, string>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const rowNum = r + 1;
    const cell = (key: string) => (row[col[key]] ?? "").trim();

    const packageId = cell("package_id");
    if (!packageId) {
      errors.push(`Row ${rowNum}: package_id is required.`);
      continue;
    }

    const dueDate = normalizeDate(cell("due_date"));
    if (!dueDate) {
      errors.push(`Row ${rowNum}: invalid due_date "${cell("due_date")}" (use YYYY-MM-DD).`);
      continue;
    }

    const courier = normalizeCourier(cell("preferred_courier"));
    if (!courier) {
      errors.push(
        `Row ${rowNum}: invalid preferred_courier "${cell("preferred_courier")}" (use ${MARKETING_COURIER_OPTIONS.join(", ")}).`
      );
      continue;
    }

    const productName = cell("product_name");
    const qty = parseInt(cell("qty"), 10);
    if (!productName) {
      errors.push(`Row ${rowNum}: product_name is required.`);
      continue;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      errors.push(`Row ${rowNum}: qty must be a positive number.`);
      continue;
    }

    const metaFields = {
      recipient_name: cell("recipient_name"),
      recipient_phone: cell("recipient_phone"),
      due_date: dueDate,
      preferred_courier: courier,
      address_line1: cell("address_line1"),
      address_line2: cell("address_line2"),
      city: cell("city"),
      state: cell("state"),
      postal_code: cell("postal_code"),
      country: cell("country") || "Singapore",
      notes: cell("notes"),
      request_purpose: cell("request_purpose"),
    };

    if (!metaFields.recipient_name) {
      errors.push(`Row ${rowNum}: recipient_name is required.`);
      continue;
    }
    if (!metaFields.recipient_phone) {
      errors.push(`Row ${rowNum}: recipient_phone is required.`);
      continue;
    }
    if (!metaFields.address_line1 || !metaFields.city || !metaFields.state || !metaFields.postal_code) {
      errors.push(`Row ${rowNum}: complete address fields are required.`);
      continue;
    }

    const metaKey = packageKey(metaFields);
    const seenKey = metaByPackageId.get(packageId);
    if (seenKey && seenKey !== metaKey) {
      errors.push(
        `Row ${rowNum}: package_id "${packageId}" has conflicting address or delivery details. Use the same values on every row for a package, or a different package_id.`
      );
      continue;
    }
    metaByPackageId.set(packageId, metaKey);

    if (!byPackageId.has(packageId)) {
      byPackageId.set(packageId, {
        meta: {
          recipient_name: metaFields.recipient_name,
          recipient_phone: metaFields.recipient_phone,
          due_date: metaFields.due_date,
          preferred_courier: courier,
          address_line1: metaFields.address_line1,
          address_line2: metaFields.address_line2 || undefined,
          city: metaFields.city,
          state: metaFields.state,
          postal_code: metaFields.postal_code,
          country: metaFields.country,
          notes: metaFields.notes || undefined,
          request_purpose: metaFields.request_purpose || undefined,
        },
        items: [],
      });
    }

    const pkg = byPackageId.get(packageId)!;
    const barcode = cell("product_barcode");
    pkg.items.push({
      product_name: productName,
      product_barcode: barcode || undefined,
      qty,
    });
  }

  if (errors.length > 0) {
    return { packages: [], preview: [], errors };
  }

  if (byPackageId.size === 0) {
    return { packages: [], preview: [], errors: ["No valid package rows found."] };
  }

  const packages: NewMarketingRequestInput[] = [];
  const preview: MarketingImportPreviewRow[] = [];

  for (const [packageId, draft] of byPackageId) {
    packages.push({ ...draft.meta, items: draft.items });
    preview.push({
      packageId,
      recipientName: draft.meta.recipient_name,
      itemCount: draft.items.length,
      dueDate: draft.meta.due_date,
      courier: draft.meta.preferred_courier,
      purpose: draft.meta.request_purpose ?? null,
    });
  }

  return { packages, preview, errors: [] };
}
