import { supabase } from "./supabaseClient";

export const DASHBOARD_PO_PAGE_SIZE = 24;

export const COMPLETED_PO_STATUSES = ["Completed", "Partial Fulfillment"] as const;

const DASHBOARD_PO_COLUMNS =
  "id, po_number, retailer_name, status, po_date, delivery_date, packed_by, carton_plan_status, total_items, created_at";

export interface DashboardPoRow {
  id: string;
  po_number: string;
  retailer_name: string;
  status: string;
  po_date: string;
  delivery_date: string;
  packed_by: string | null;
  carton_plan_status: string | null;
  total_items: number;
  created_at: string;
}

export async function fetchDashboardPoCount(viewMode: "ACTIVE" | "HISTORY"): Promise<number> {
  let query = supabase.from("purchase_orders").select("id", { count: "exact", head: true });

  if (viewMode === "HISTORY") {
    query = query.in("status", [...COMPLETED_PO_STATUSES]);
  } else {
    query = query.not("status", "in", `(${COMPLETED_PO_STATUSES.map((s) => `"${s}"`).join(",")})`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchDashboardPosPage(
  viewMode: "ACTIVE" | "HISTORY",
  page: number
): Promise<{ rows: DashboardPoRow[]; totalCount: number }> {
  const pageSize = DASHBOARD_PO_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("purchase_orders")
    .select(DASHBOARD_PO_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (viewMode === "HISTORY") {
    query = query.in("status", [...COMPLETED_PO_STATUSES]);
  } else {
    query = query.not("status", "in", `(${COMPLETED_PO_STATUSES.map((s) => `"${s}"`).join(",")})`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as DashboardPoRow[],
    totalCount: count ?? 0,
  };
}
