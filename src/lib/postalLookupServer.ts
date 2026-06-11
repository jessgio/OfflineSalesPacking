import { getCountryByCode, type ShippingCountry } from "./countries";

export type PostalLookupResult = {
  city: string;
  state: string;
  postalCode: string;
};

type ZippopotamResponse = {
  "post code": string;
  places?: Array<{
    "place name": string;
    state?: string;
    "state abbreviation"?: string;
  }>;
};

type CariKodePosResponse = {
  success: boolean;
  data?: {
    postalCodes?: Array<{
      code: string;
      city?: { name?: string };
      province?: { name?: string };
    }>;
  };
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  borough?: string;
  province?: string;
  postcode?: string;
};

type NominatimResult = {
  address?: NominatimAddress;
};

function titleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 4 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function formatIndonesianCityName(name: string): string {
  return titleCaseWords(
    name
      .replace(/^KOTA ADM\.\s*/i, "")
      .replace(/^KAB\.?\s*/i, "")
      .replace(/^KOTA\s*/i, "")
  );
}

async function lookupIndonesiaPostalCode(postal: string): Promise<PostalLookupResult | null> {
  const normalized = postal.trim();
  const response = await fetch(
    `https://carikodepos.id/api/postal-codes?search=${encodeURIComponent(normalized)}&limit=20`,
    { next: { revalidate: 86400 } }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as CariKodePosResponse;
  const match = data.data?.postalCodes?.find((entry) => entry.code === normalized);
  if (!match?.city?.name || !match.province?.name) return null;

  return {
    city: formatIndonesianCityName(match.city.name),
    state: titleCaseWords(match.province.name),
    postalCode: match.code,
  };
}

async function lookupZippopotamPostalCode(
  countryCode: string,
  postal: string
): Promise<PostalLookupResult | null> {
  const response = await fetch(
    `https://api.zippopotam.us/${encodeURIComponent(countryCode)}/${encodeURIComponent(postal)}`,
    { next: { revalidate: 86400 } }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as ZippopotamResponse;
  const place = data.places?.[0];
  if (!place) return null;

  return {
    city: place["place name"],
    state: place.state || place["state abbreviation"] || "",
    postalCode: data["post code"] ?? postal,
  };
}

async function lookupNominatimPostalCode(
  country: ShippingCountry,
  postal: string
): Promise<PostalLookupResult | null> {
  const params = new URLSearchParams({
    postalcode: postal,
    country: country.name,
    format: "json",
    addressdetails: "1",
    limit: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "aeris-fulfillment-dashboard/1.0 (marketing shipment requests)",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;

  const results = (await response.json()) as NominatimResult[];
  const address = results[0]?.address;
  if (!address) return null;

  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.suburb ||
    address.village ||
    address.county ||
    "";
  const state =
    address.state || address.region || address.province || address.borough || "";

  if (!city && !state) return null;

  return {
    city,
    state,
    postalCode: address.postcode ?? postal,
  };
}

export async function resolvePostalCode(
  countryCode: string,
  postal: string
): Promise<PostalLookupResult | null> {
  const country = getCountryByCode(countryCode);
  if (!country) return null;

  const normalizedPostal = postal.trim();
  if (!normalizedPostal) return null;

  if (country.code === "ID") {
    const indonesiaResult = await lookupIndonesiaPostalCode(normalizedPostal);
    if (indonesiaResult) return indonesiaResult;
  }

  const zippopotamResult = await lookupZippopotamPostalCode(country.code, normalizedPostal);
  if (zippopotamResult) return zippopotamResult;

  return lookupNominatimPostalCode(country, normalizedPostal);
}
