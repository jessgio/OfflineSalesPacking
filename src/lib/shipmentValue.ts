export function computeShipmentRetailValue(
  items: Array<{ qty: number; rsp?: number | null }>
): number {
  return items.reduce((sum, item) => {
    const unit = item.rsp;
    if (unit == null || !Number.isFinite(unit) || unit <= 0) return sum;
    return sum + unit * item.qty;
  }, 0);
}

export function clampDeclaredValueIdr(value: number): number {
  return Math.max(1_000, Math.min(Math.round(value), 50_000_000));
}

export function resolveDeclaredValueIdr(
  items: Array<{ qty: number; rsp?: number | null }>,
  override?: number | null
): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return clampDeclaredValueIdr(override);
  }
  const retail = computeShipmentRetailValue(items);
  return clampDeclaredValueIdr(retail > 0 ? retail : 100_000);
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
