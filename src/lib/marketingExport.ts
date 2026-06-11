import type { MarketingRequest } from "../types/marketing";

const EXPORT_HEADERS = [
  "barcode",
  "status",
  "requested_by_name",
  "requested_by_email",
  "requested_by_division",
  "requested_at",
  "recipient_name",
  "recipient_phone",
  "preferred_courier",
  "due_date",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "country",
  "packed_by",
  "packed_at",
  "shipped_by",
  "shipped_at",
  "actual_shipping_label",
  "actual_shipping_label_by",
  "actual_shipping_label_at",
  "product_name",
  "product_barcode",
  "qty",
  "request_purpose",
  "notes",
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return value;
}

export function buildMarketingHistoryExportCsv(requests: MarketingRequest[]): string {
  const rows: string[] = [EXPORT_HEADERS.join(",")];

  for (const req of requests) {
    const items = req.items?.length ? req.items : [{ product_name: "", product_barcode: null, qty: 0 }];
    for (const item of items) {
      const line = [
        req.barcode,
        req.status,
        req.requested_by_name,
        req.requested_by_email,
        req.requested_by_division ?? "",
        formatTimestamp(req.created_at),
        req.recipient_name,
        req.recipient_phone ?? "",
        req.preferred_courier ?? "",
        formatDate(req.due_date),
        req.address_line1,
        req.address_line2 ?? "",
        req.city,
        req.state,
        req.postal_code,
        req.country,
        req.packed_by ?? "",
        formatTimestamp(req.packed_at),
        req.shipped_by ?? "",
        formatTimestamp(req.shipped_at),
        req.actual_shipping_label ?? "",
        req.actual_shipping_label_by ?? "",
        formatTimestamp(req.actual_shipping_label_at),
        item.product_name,
        item.product_barcode ?? "",
        String(item.qty),
        req.request_purpose ?? "",
        req.notes ?? "",
      ].map(escapeCsvCell);
      rows.push(line.join(","));
    }
  }

  return rows.join("\r\n");
}

export function downloadMarketingHistoryExport(
  requests: MarketingRequest[],
  filenamePrefix = "marketing-shipments-export"
): void {
  if (requests.length === 0) return;

  const csv = buildMarketingHistoryExportCsv(requests);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${stamp}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
