export type ShippingCountry = {
  code: string;
  name: string;
};

/** Countries supported for postal lookup. */
export const SHIPPING_COUNTRIES: ShippingCountry[] = [
  { code: "ID", name: "Indonesia" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "KH", name: "Cambodia" },
  { code: "MM", name: "Myanmar" },
  { code: "BN", name: "Brunei" },
  { code: "LA", name: "Laos" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "AE", name: "United Arab Emirates" },
];

export function getCountryByName(name: string): ShippingCountry | undefined {
  const trimmed = name.trim().toLowerCase();
  return SHIPPING_COUNTRIES.find((country) => country.name.toLowerCase() === trimmed);
}

export function getCountryByCode(code: string): ShippingCountry | undefined {
  const trimmed = code.trim().toUpperCase();
  return SHIPPING_COUNTRIES.find((country) => country.code === trimmed);
}
