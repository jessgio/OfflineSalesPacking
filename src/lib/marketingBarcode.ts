/** Marketing shipment barcodes use MK prefix so scanners distinguish them from LPNs and master boxes. */

export function generateMarketingBarcode(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  return `MK${digits}`;
}

export function isMarketingBarcode(code: string): boolean {
  return /^MK\d{12}$/.test(code.trim().toUpperCase());
}
