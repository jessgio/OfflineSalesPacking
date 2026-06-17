import { supabase } from "./supabaseClient";
import { getSupabaseErrorMessage } from "./supabaseError";

export interface ProductRow {
  barcode: string;
  clean_name: string;
  sociolla_sku: string | null;
  rsp: number | null;
}

const PRODUCT_SELECT = "barcode, clean_name, sociolla_sku, rsp";

export async function fetchProducts(query?: string): Promise<ProductRow[]> {
  let builder = supabase.from("products").select(PRODUCT_SELECT).order("clean_name");

  const term = query?.trim();
  if (term) {
    builder = builder.or(`clean_name.ilike.%${term}%,barcode.ilike.%${term}%`);
  }

  const { data, error } = await builder.limit(500);
  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load products"));
  return (data ?? []).map(normalizeProductRow);
}

export async function updateProductRsp(barcode: string, rsp: number | null): Promise<void> {
  const normalized =
    rsp != null && Number.isFinite(rsp) && rsp >= 0 ? Math.round(rsp) : null;

  const { error } = await supabase.from("products").update({ rsp: normalized }).eq("barcode", barcode);
  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to update RSP"));
}

export async function upsertProducts(rows: ProductRow[]): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 };

  const payload = rows.map((row) => ({
    barcode: row.barcode.trim(),
    clean_name: row.clean_name.trim(),
    sociolla_sku: row.sociolla_sku?.trim() || null,
    rsp: row.rsp != null && row.rsp >= 0 ? Math.round(row.rsp) : null,
  }));

  const { error } = await supabase.from("products").upsert(payload, { onConflict: "barcode" });
  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to import products"));
  return { upserted: payload.length };
}

export async function lookupProductRspByBarcodes(
  barcodes: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(barcodes.map((b) => b.trim()).filter(Boolean))];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("products")
    .select("barcode, rsp")
    .in("barcode", unique);

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to look up product RSP"));

  for (const row of data ?? []) {
    if (row.rsp != null && Number(row.rsp) > 0) {
      map.set(row.barcode, Number(row.rsp));
    }
  }
  return map;
}

function normalizeProductRow(row: {
  barcode: string;
  clean_name: string;
  sociolla_sku?: string | null;
  rsp?: number | null;
}): ProductRow {
  return {
    barcode: row.barcode,
    clean_name: row.clean_name,
    sociolla_sku: row.sociolla_sku ?? null,
    rsp: row.rsp != null ? Number(row.rsp) : null,
  };
}
