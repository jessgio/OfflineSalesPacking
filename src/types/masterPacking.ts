export type PackingSessionStatus = "draft" | "packing" | "completed";
export type MasterBoxStatus = "open" | "sealed";

export interface PackingSession {
  id: string;
  status: PackingSessionStatus;
  session_code: string;
  packed_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PackingSessionPo {
  id: string;
  session_id: string;
  po_id: string;
}

export interface MasterBox {
  id: string;
  session_id: string;
  master_barcode: string;
  box_number: number;
  status: MasterBoxStatus;
  created_at: string;
  sealed_at: string | null;
}

export interface MasterBoxContent {
  id: string;
  master_box_id: string;
  po_box_id: string;
  inner_barcode: string;
  po_id: string;
  scanned_at: string;
}

export interface MasterBoxContentRow extends MasterBoxContent {
  product_name: string;
  po_number: string;
}

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  retailer_name: string;
  status: string;
  po_date: string;
  delivery_date: string;
  master_pack_status: "not_started" | "in_progress" | "completed";
  master_pack_session_id: string | null;
  master_pack_completed_at: string | null;
  master_pack_completed_by: string | null;
}

export interface PoBoxRow {
  id: string;
  po_id: string;
  product_barcode: string;
  box_barcode: string;
  carton_number: number;
  total_cartons: number;
  is_scanned: boolean;
}

export interface ManifestMasterBox {
  box_number: number;
  master_barcode: string;
  status: MasterBoxStatus;
  inner_boxes: ManifestInnerBox[];
}

export interface ManifestInnerBox {
  inner_barcode: string;
  po_number: string;
  product_name: string;
  carton_number: number;
  scanned_at: string;
}

export interface ManifestLooseInnerBox {
  inner_barcode: string;
  po_number: string;
  product_name: string;
  carton_number: number;
  is_assigned_to_master: boolean;
}
