/**
 * Sociolla inner LPN format: 5-digit PO suffix + 8-digit variant sequence (13 digits total).
 * Example PO 2026/00017174 → prefix 17174, first label 1717400000001.
 */
export function sociollaLpnPrefix(poNumber: string): string {
  const eightDigit = poNumber.match(/\/(\d{8})$/)?.[1];
  if (eightDigit) return eightDigit.slice(-5);

  const digits = poNumber.replace(/\D/g, "");
  if (!digits) return "00000";
  return digits.slice(-8).padStart(8, "0").slice(-5);
}

export function sociollaLpnBarcode(poNumber: string, variantIndex: number): string {
  const prefix = sociollaLpnPrefix(poNumber);
  const seq = String(variantIndex).padStart(8, "0");
  return `${prefix}${seq}`;
}

export function isSociollaLpnBarcode(code: string): boolean {
  return /^\d{13}$/.test(code.trim());
}
