export interface CartonPlanLine {
  poItemId: string;
  barcode: string;
  productName: string;
  qty: number;
}

export interface CartonPlanBox {
  id: string;
  lines: CartonPlanLine[];
}

export interface PoItemForPlan {
  id: string;
  barcode: string;
  product_name: string;
  target_qty: number;
  retailer_sku?: string | null;
}
