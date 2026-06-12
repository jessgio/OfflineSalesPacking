import { supabase } from "./supabaseClient";

/** Above this count, pack station resolves LPNs on scan instead of loading all rows. */
export const LARGE_PO_BOX_THRESHOLD = 250;

const BOX_LOOKUP_COLUMNS =
  "id, po_id, product_barcode, box_barcode, carton_number, total_cartons, is_scanned, packed_at, packed_by";

const STATS_PAGE_SIZE = 1000;

export interface PoBoxRow {
  id: string;
  po_id: string;
  product_barcode: string;
  box_barcode: string;
  carton_number: number;
  total_cartons: number;
  is_scanned: boolean;
  packed_at: string | null;
  packed_by: string | null;
}

export interface PoBoxStats {
  totalBoxes: number;
  scannedTotal: number;
  scannedByProduct: Record<string, number>;
}

export interface PoBoxContentRow {
  id: string;
  po_box_id: string;
  product_barcode: string;
  qty: number;
  scanned_qty: number;
}

export async function fetchPoBoxCount(poId: string): Promise<number> {
  const { count, error } = await supabase
    .from("po_boxes")
    .select("id", { count: "exact", head: true })
    .eq("po_id", poId);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchPoBoxesForPo(poId: string): Promise<PoBoxRow[]> {
  const { data, error } = await supabase.from("po_boxes").select(BOX_LOOKUP_COLUMNS).eq("po_id", poId);
  if (error) throw error;
  return (data ?? []) as PoBoxRow[];
}

export async function fetchPoBoxStats(poId: string): Promise<PoBoxStats> {
  const scannedByProduct: Record<string, number> = {};
  let totalBoxes = 0;
  let scannedTotal = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("po_boxes")
      .select("product_barcode, is_scanned")
      .eq("po_id", poId)
      .range(from, from + STATS_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      totalBoxes += 1;
      if (row.is_scanned) {
        scannedTotal += 1;
        scannedByProduct[row.product_barcode] = (scannedByProduct[row.product_barcode] ?? 0) + 1;
      }
    }

    if (data.length < STATS_PAGE_SIZE) break;
    from += STATS_PAGE_SIZE;
  }

  return { totalBoxes, scannedTotal, scannedByProduct };
}

export async function lookupPoBoxByBarcode(poId: string, barcode: string): Promise<PoBoxRow | null> {
  const { data, error } = await supabase
    .from("po_boxes")
    .select(BOX_LOOKUP_COLUMNS)
    .eq("po_id", poId)
    .eq("box_barcode", barcode.trim())
    .maybeSingle();
  if (error) throw error;
  return data as PoBoxRow | null;
}

export async function fetchPoBoxContentsForBox(boxId: string): Promise<PoBoxContentRow[]> {
  const { data, error } = await supabase
    .from("po_box_contents")
    .select("id, po_box_id, product_barcode, qty, scanned_qty")
    .eq("po_box_id", boxId);
  if (error) throw error;
  return (data ?? []) as PoBoxContentRow[];
}

export async function fetchAllPoBoxContentsForPo(poId: string): Promise<PoBoxContentRow[]> {
  const boxes = await fetchPoBoxesForPo(poId);
  if (boxes.length === 0) return [];

  const boxIds = boxes.map((b) => b.id);
  const allContents: PoBoxContentRow[] = [];

  for (let i = 0; i < boxIds.length; i += STATS_PAGE_SIZE) {
    const chunk = boxIds.slice(i, i + STATS_PAGE_SIZE);
    const { data, error } = await supabase
      .from("po_box_contents")
      .select("id, po_box_id, product_barcode, qty, scanned_qty")
      .in("po_box_id", chunk);
    if (error) throw error;
    allContents.push(...((data ?? []) as PoBoxContentRow[]));
  }

  return allContents;
}
