export type PostalLookupResult = {
  city: string;
  state: string;
  postalCode: string;
};

export async function lookupPostalCode(
  countryCode: string,
  postalCode: string
): Promise<PostalLookupResult> {
  const params = new URLSearchParams({
    country: countryCode,
    postal: postalCode,
  });

  const response = await fetch(`/api/postal-lookup?${params.toString()}`);
  const payload = (await response.json()) as PostalLookupResult & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Postal code not found.");
  }

  return {
    city: payload.city,
    state: payload.state,
    postalCode: payload.postalCode,
  };
}
