/**
 * Sociolla inner LPN format: 5-digit PO suffix + 8-digit variant sequence (13 digits total).
 * Example PO #PO/SRI/2026/00017174 → prefix 17174, first label 1717400000001.
 */
export function sociollaLpnPrefix(poNumber: string): string {
  const digits = poNumber.replace(/\D/g, "");
  if (!digits) return "00000";
  return digits.slice(-5).padStart(5, "0");
}

export function sociollaLpnBarcode(poNumber: string, variantIndex: number): string {
  const prefix = sociollaLpnPrefix(poNumber);
  const seq = String(variantIndex).padStart(8, "0");
  return `${prefix}${seq}`;
}

export function isSociollaLpnBarcode(code: string): boolean {
  return /^\d{13}$/.test(code.trim());
}
