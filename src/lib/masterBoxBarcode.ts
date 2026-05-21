/** Master carton barcodes use MB prefix so pack station never confuses them with inner LPNs. */

export function sessionCodeFromId(sessionId: string): string {
  const hex = sessionId.replace(/-/g, "").slice(0, 8);
  const numeric = parseInt(hex, 16);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return String(numeric % 100000000).padStart(8, "0");
  }
  return sessionId.replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
}

export function generateMasterBarcode(sessionCode: string, boxNumber: number): string {
  const seq = String(boxNumber).padStart(4, "0");
  return `MB${sessionCode}${seq}`;
}

export function isMasterBarcode(code: string): boolean {
  return /^MB\d{12}$/.test(code.trim().toUpperCase());
}
