"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Package, Printer, Truck, X } from "lucide-react";
import { DashButton, cx, fieldInput } from "../dashboard/primitives";
import { markMarketingRequestShipped } from "../../lib/marketingDb";
import type { MarketingRequest } from "../../types/marketing";

interface BiteshipRateOption {
  courierCompany: string;
  courierCompanyName: string;
  courierType: string;
  courierTypeName: string;
  price: number;
  duration: string;
  matchesPreference: boolean;
}

interface PackageDraft {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  valueIdr: number;
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function MarketingBiteshipModal({
  request,
  packerName,
  onClose,
  onBooked,
  onComplete,
}: {
  request: MarketingRequest;
  packerName: string;
  onClose: () => void;
  /** Called after Biteship booking succeeds (order stays packed until completed). */
  onBooked: (requestId: string) => void;
  /** Called after the carrier label step is done and the order is marked shipped. */
  onComplete: (requestId: string) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pkg, setPkg] = useState<PackageDraft>({
    weightGrams: 500,
    lengthCm: 25,
    widthCm: 20,
    heightCm: 15,
    valueIdr: 100_000,
  });
  const [rates, setRates] = useState<BiteshipRateOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [booking, setBooking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    trackingId: string | null;
    waybillUrl: string | null;
    courierLabel: string;
    price: number | null;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/biteship/rates")
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => setConfigured(!!data.configured))
      .catch(() => setConfigured(false));
  }, []);

  const loadRates = useCallback(async () => {
    setLoadingRates(true);
    setError("");
    setRates([]);
    setSelectedKey(null);
    try {
      const res = await fetch("/api/biteship/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, ...pkg }),
      });
      const data = (await res.json()) as {
        error?: string;
        rates?: BiteshipRateOption[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load rates");
      }
      const nextRates = data.rates ?? [];
      setRates(nextRates);
      const preferred = nextRates.find((r) => r.matchesPreference);
      if (preferred) {
        setSelectedKey(`${preferred.courierCompany}:${preferred.courierType}`);
      } else if (nextRates[0]) {
        setSelectedKey(`${nextRates[0].courierCompany}:${nextRates[0].courierType}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load rates");
    } finally {
      setLoadingRates(false);
    }
  }, [request.id, pkg]);

  const handleBook = async () => {
    if (!selectedKey) {
      setError("Select a courier rate first.");
      return;
    }
    if (!packerName.trim()) {
      setError("Enter your packer initials on the fulfill page first.");
      return;
    }

    const selected = rates.find((r) => `${r.courierCompany}:${r.courierType}` === selectedKey);
    if (!selected) return;

    setBooking(true);
    setError("");
    try {
      const res = await fetch("/api/biteship/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          courierCompany: selected.courierCompany,
          courierType: selected.courierType,
          shippedBy: packerName,
          ...pkg,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        order?: {
          trackingId: string | null;
          waybillUrl: string | null;
          courierCompany: string;
          courierType: string;
          price: number | null;
        };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to book shipment");
      }

      const order = data.order!;
      setSuccess({
        trackingId: order.trackingId,
        waybillUrl: order.waybillUrl,
        courierLabel: `${selected.courierCompanyName} · ${selected.courierTypeName}`,
        price: order.price ?? selected.price,
      });

      onBooked(request.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to book shipment");
    } finally {
      setBooking(false);
    }
  };

  const handlePrintLabel = () => {
    window.open(
      `/marketing/labels/biteship/${request.id}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleComplete = async () => {
    if (!packerName.trim()) {
      setError("Enter your packer initials on the fulfill page first.");
      return;
    }

    setCompleting(true);
    setError("");
    try {
      await markMarketingRequestShipped(request.id, packerName);

      void fetch("/api/marketing-shipped/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });

      onComplete(request.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to mark shipment complete");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="biteship-modal-title"
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
        data-no-refocus
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Biteship</p>
            <h2 id="biteship-modal-title" className="text-lg font-black text-gray-900">
              Book shipment
            </h2>
            <p className="text-xs text-gray-600 mt-0.5 font-mono">{request.barcode}</p>
          </div>
          <DashButton type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </DashButton>
        </div>

        <div className="px-5 py-5 space-y-5">
          {configured === false && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Biteship is not configured on this server. Add API credentials to the environment to
              enable booking.
            </p>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-900 rounded-xl px-4 py-3">
                <p className="font-bold">Shipment booked with Biteship</p>
                <p className="text-sm mt-1">{success.courierLabel}</p>
                {success.price != null && (
                  <p className="text-sm font-semibold mt-1">{formatIdr(success.price)}</p>
                )}
                {success.trackingId && (
                  <p className="text-sm font-mono mt-2">AWB: {success.trackingId}</p>
                )}
                <p className="text-sm mt-3 text-green-800">
                  Print the carrier label, affix it to the package, then mark complete to move this
                  order to history.
                </p>
              </div>
              {success.waybillUrl && (
                <a
                  href={success.waybillUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <DashButton variant="subtle" size="md" className="w-full">
                    <ExternalLink className="w-4 h-4" /> Open carrier waybill
                  </DashButton>
                </a>
              )}
              <DashButton variant="primary" size="md" className="w-full" onClick={handlePrintLabel}>
                <Printer className="w-4 h-4" /> Print carrier label
              </DashButton>
              <DashButton
                variant="success"
                size="md"
                className="w-full"
                disabled={completing}
                onClick={() => void handleComplete()}
              >
                {completing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
                Mark complete
              </DashButton>
              <DashButton variant="ghost" size="sm" className="w-full" onClick={onClose}>
                Close (stay in active queue)
              </DashButton>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm">
                <p className="font-semibold text-gray-900">{request.recipient_name}</p>
                <p className="text-gray-600 mt-0.5">
                  {request.address_line1}
                  {request.city ? `, ${request.city}` : ""} {request.postal_code}
                </p>
                {request.preferred_courier && (
                  <p className="text-xs font-bold uppercase text-violet-700 mt-2">
                    Preferred: {request.preferred_courier}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Package details
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    Weight (g)
                    <input
                      type="number"
                      min={100}
                      max={50000}
                      value={pkg.weightGrams}
                      onChange={(e) =>
                        setPkg((prev) => ({ ...prev, weightGrams: Number(e.target.value) || 500 }))
                      }
                      className={cx(fieldInput, "mt-1")}
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Value (IDR)
                    <input
                      type="number"
                      min={1000}
                      value={pkg.valueIdr}
                      onChange={(e) =>
                        setPkg((prev) => ({ ...prev, valueIdr: Number(e.target.value) || 100_000 }))
                      }
                      className={cx(fieldInput, "mt-1")}
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    L (cm)
                    <input
                      type="number"
                      min={1}
                      value={pkg.lengthCm}
                      onChange={(e) =>
                        setPkg((prev) => ({ ...prev, lengthCm: Number(e.target.value) || 25 }))
                      }
                      className={cx(fieldInput, "mt-1")}
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    W (cm)
                    <input
                      type="number"
                      min={1}
                      value={pkg.widthCm}
                      onChange={(e) =>
                        setPkg((prev) => ({ ...prev, widthCm: Number(e.target.value) || 20 }))
                      }
                      className={cx(fieldInput, "mt-1")}
                    />
                  </label>
                  <label className="text-xs text-gray-600 col-span-2">
                    H (cm)
                    <input
                      type="number"
                      min={1}
                      value={pkg.heightCm}
                      onChange={(e) =>
                        setPkg((prev) => ({ ...prev, heightCm: Number(e.target.value) || 15 }))
                      }
                      className={cx(fieldInput, "mt-1")}
                    />
                  </label>
                </div>
                <DashButton
                  type="button"
                  variant="subtle"
                  size="md"
                  className="w-full mt-3"
                  onClick={() => void loadRates()}
                  disabled={loadingRates || configured === false}
                >
                  {loadingRates ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                  {rates.length > 0 ? "Refresh rates" : "Get courier rates"}
                </DashButton>
              </div>

              {rates.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Select courier
                  </p>
                  <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {rates.map((rate) => {
                      const key = `${rate.courierCompany}:${rate.courierType}`;
                      const selected = selectedKey === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setSelectedKey(key)}
                            className={cx(
                              "w-full text-left rounded-xl border px-3 py-2.5 transition",
                              selected
                                ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm text-gray-900">
                                  {rate.courierCompanyName}
                                  <span className="text-gray-600 font-normal">
                                    {" "}
                                    · {rate.courierTypeName}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{rate.duration}</p>
                                {rate.matchesPreference && (
                                  <span className="inline-block mt-1 text-[10px] font-bold uppercase text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                                    Matches preference
                                  </span>
                                )}
                              </div>
                              <p className="font-bold text-sm text-gray-900 shrink-0">
                                {formatIdr(rate.price)}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <DashButton
                type="button"
                variant="success"
                size="md"
                className="w-full"
                disabled={booking || !selectedKey || configured === false}
                onClick={() => void handleBook()}
              >
                {booking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
                Book shipment
              </DashButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
