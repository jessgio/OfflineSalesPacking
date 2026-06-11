"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../dashboard/primitives";
import { getCountryByName, SHIPPING_COUNTRIES } from "../../lib/countries";
import { lookupPostalCode } from "../../lib/postalLookup";

type LookupStatus = "idle" | "loading" | "found" | "not-found" | "manual";

export type MarketingAddressFieldsProps = {
  country: string;
  postalCode: string;
  city: string;
  state: string;
  onCountryChange: (value: string) => void;
  onPostalCodeChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  fieldInput: string;
};

export function MarketingAddressFields({
  country,
  postalCode,
  city,
  state,
  onCountryChange,
  onPostalCodeChange,
  onCityChange,
  onStateChange,
  fieldInput,
}: MarketingAddressFieldsProps) {
  const skipInitialLookup = useRef(true);
  const lookupRequestRef = useRef(0);
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>(
    city.trim() && state.trim() ? "found" : "idle"
  );
  const [lookupError, setLookupError] = useState("");

  const countryOptions = useMemo(() => {
    if (!country.trim() || getCountryByName(country)) {
      return SHIPPING_COUNTRIES;
    }
    return [{ code: "XX", name: country }, ...SHIPPING_COUNTRIES];
  }, [country]);

  useEffect(() => {
    if (skipInitialLookup.current) {
      skipInitialLookup.current = false;
      if (city.trim() && state.trim()) {
        setLookupStatus("found");
      }
      return;
    }

    const countryEntry = getCountryByName(country);
    const postal = postalCode.trim();

    if (!countryEntry || !postal) {
      if (lookupStatus !== "manual") {
        setLookupStatus("idle");
        setLookupError("");
      }
      return;
    }

    const requestId = ++lookupRequestRef.current;
    const timer = window.setTimeout(async () => {
      setLookupStatus("loading");
      setLookupError("");

      try {
        const result = await lookupPostalCode(countryEntry.code, postal);
        if (requestId !== lookupRequestRef.current) return;

        onCityChange(result.city);
        onStateChange(result.state);
        if (result.postalCode !== postal) {
          onPostalCodeChange(result.postalCode);
        }
        setLookupStatus("found");
      } catch (err: unknown) {
        if (requestId !== lookupRequestRef.current) return;

        onCityChange("");
        onStateChange("");
        setLookupStatus("not-found");
        setLookupError(
          err instanceof Error ? err.message : "Could not find a city or region for this postal code."
        );
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [country, postalCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCountryChange = (value: string) => {
    lookupRequestRef.current += 1;
    onCountryChange(value);
    onPostalCodeChange("");
    onCityChange("");
    onStateChange("");
    setLookupStatus("idle");
    setLookupError("");
  };

  const showLocationFields =
    lookupStatus === "loading" ||
    lookupStatus === "found" ||
    lookupStatus === "manual" ||
    lookupStatus === "not-found";

  const cityStateReadOnly = lookupStatus === "found";

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Country</label>
          <select
            required
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={fieldInput}
          >
            {countryOptions.map((entry) => (
              <option key={entry.code} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Postal / ZIP code</label>
          <input
            required
            value={postalCode}
            onChange={(e) => onPostalCodeChange(e.target.value)}
            placeholder="Postal / ZIP code"
            className={fieldInput}
            autoComplete="postal-code"
          />
        </div>
      </div>

      {lookupStatus === "loading" && (
        <p className="text-xs text-gray-600 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          Looking up city and region…
        </p>
      )}

      {lookupError && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lookupError} Enter city and region manually below.
        </p>
      )}

      {showLocationFields && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
            <input
              required
              readOnly={cityStateReadOnly}
              value={city}
              onChange={(e) => {
                onCityChange(e.target.value);
                setLookupStatus("manual");
              }}
              placeholder={cityStateReadOnly ? "Auto-filled" : "City"}
              className={cx(fieldInput, cityStateReadOnly && "bg-gray-50 text-gray-800 cursor-default")}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Province / region</label>
            <input
              required
              readOnly={cityStateReadOnly}
              value={state}
              onChange={(e) => {
                onStateChange(e.target.value);
                setLookupStatus("manual");
              }}
              placeholder={cityStateReadOnly ? "Auto-filled" : "Province / region"}
              className={cx(fieldInput, cityStateReadOnly && "bg-gray-50 text-gray-800 cursor-default")}
            />
          </div>
        </div>
      )}

      {!showLocationFields && postalCode.trim() && (
        <p className="text-xs text-gray-500">City and region will appear after the postal code is recognized.</p>
      )}
    </div>
  );
}
