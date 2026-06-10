"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  Download,
  Loader2,
  Package,
  PackageCheck,
  Printer,
  ScanLine,
  Truck,
  X,
} from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard, cx, fieldInput } from "../../../components/dashboard/primitives";
import { ChatLoginBar } from "../../../components/marketing/ChatLoginBar";
import { RequestChat } from "../../../components/marketing/RequestChat";
import { getMarketingSession } from "../../../lib/marketingAuth";
import type { MarketingSession } from "../../../types/marketing";
import {
  fetchCompletedMarketingRequests,
  fetchMarketingRequestByBarcode,
  fetchPendingMarketingRequests,
  markMarketingRequestPacked,
  markMarketingRequestsPackedBulk,
  markMarketingRequestShipped,
} from "../../../lib/marketingDb";
import { downloadMarketingHistoryExport } from "../../../lib/marketingExport";
import { isMarketingBarcode } from "../../../lib/marketingBarcode";
import type { MarketingRequest } from "../../../types/marketing";

const tabBtnBase = "px-4 py-2.5 text-sm font-bold border-b-2 transition";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function playBeep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.25));
  } catch {
    /* audio optional */
  }
}

export default function MarketingFulfillPage() {
  const [moduleTab, setModuleTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<MarketingRequest[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packerName, setPackerName] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanOk, setScanOk] = useState<boolean | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [chatSession, setChatSession] = useState<MarketingSession | null>(null);
  const [batchPacking, setBatchPacking] = useState(false);

  useEffect(() => {
    setChatSession(getMarketingSession());
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pending, completed] = await Promise.all([
        fetchPendingMarketingRequests(),
        fetchCompletedMarketingRequests(),
      ]);
      setRequests(pending);
      setCompletedRequests(completed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    setSelectedIds([]);
  }, [moduleTab]);

  useEffect(() => {
    const focus = () => scanRef.current?.focus();
    focus();
    const interval = setInterval(focus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanValue.trim().toUpperCase();
    setScanValue("");
    if (!code) return;

    if (!isMarketingBarcode(code)) {
      setScanOk(false);
      setScanMessage("Not a marketing barcode (expected MK + 12 digits).");
      playBeep(false);
      return;
    }

    if (!packerName.trim()) {
      setScanOk(false);
      setScanMessage("Enter your packer initials first.");
      playBeep(false);
      return;
    }

    try {
      const req = await fetchMarketingRequestByBarcode(code);
      if (!req) {
        setScanOk(false);
        setScanMessage(`No request found for ${code}.`);
        playBeep(false);
        return;
      }

      if (req.status === "packed") {
        setScanOk(true);
        setScanMessage(`${code} already packed by ${req.packed_by}. Open label to reprint.`);
        playBeep(true);
        return;
      }

      if (req.status !== "pending") {
        setScanOk(false);
        setScanMessage(`Request ${code} is ${req.status}.`);
        playBeep(false);
        return;
      }

      await markMarketingRequestPacked(req.id, packerName);
      setScanOk(true);
      setScanMessage(`Packed ${code} for ${req.recipient_name}. Print label and affix to package.`);
      playBeep(true);
      await loadQueue();
    } catch (err: unknown) {
      setScanOk(false);
      setScanMessage(err instanceof Error ? err.message : "Scan failed");
      playBeep(false);
    }
  };

  const handleMarkShipped = async (id: string) => {
    if (!packerName.trim()) {
      setError("Enter your packer initials before marking shipped.");
      return;
    }
    try {
      await markMarketingRequestShipped(id, packerName);
      await loadQueue();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllHistory = () => {
    if (selectedIds.length === completedRequests.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(completedRequests.map((req) => req.id));
  };

  const toggleSelectAllActive = () => {
    if (selectedIds.length === requests.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(requests.map((req) => req.id));
  };

  const handleExportSelected = () => {
    const selected = completedRequests.filter((req) => selectedIds.includes(req.id));
    downloadMarketingHistoryExport(selected);
  };

  const handleBatchPrintLabels = () => {
    if (selectedIds.length === 0) return;
    const url = `/marketing/labels/batch?ids=${encodeURIComponent(selectedIds.join(","))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleBatchMarkPacked = async () => {
    if (!packerName.trim()) {
      setError("Enter your packer initials before batch packing.");
      return;
    }
    if (selectedIds.length === 0) return;

    const pendingSelected = requests.filter(
      (req) => selectedIds.includes(req.id) && req.status === "pending"
    );
    if (pendingSelected.length === 0) {
      setError("No pending orders in selection. Only pending orders can be batch packed.");
      return;
    }

    setBatchPacking(true);
    setError("");
    try {
      const packed = await markMarketingRequestsPackedBulk(
        pendingSelected.map((req) => req.id),
        packerName
      );
      await loadQueue();
      const packedIds = packed.map((req) => req.id).join(",");
      window.open(
        `/marketing/manifest/batch?ids=${encodeURIComponent(packedIds)}`,
        "_blank",
        "noopener,noreferrer"
      );
      setSelectedIds([]);
      const skipped = selectedIds.length - packed.length;
      setScanOk(true);
      setScanMessage(
        skipped > 0
          ? `Packed ${packed.length} package${packed.length === 1 ? "" : "s"}. ${skipped} already packed or not pending. Manifest opened for printing.`
          : `Packed ${packed.length} package${packed.length === 1 ? "" : "s"}. Manifest opened for printing.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to batch pack orders");
    } finally {
      setBatchPacking(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const selectedPendingCount = requests.filter(
    (req) => selectedIds.includes(req.id) && req.status === "pending"
  ).length;

  return (
    <div className={cx("min-h-screen bg-gray-100", selectedIds.length > 0 ? "pb-28" : "pb-12")}>
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </DashButton>
            </Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Offline Team</p>
              <h1 className="text-xl font-black text-gray-900">Marketing Fulfillment</h1>
            </div>
          </div>
          <div className="text-sm font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
            {pendingCount} pending
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <ChatLoginBar session={chatSession} onSessionChange={setChatSession} />

        <div className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setModuleTab("ACTIVE")}
            className={cx(
              tabBtnBase,
              moduleTab === "ACTIVE"
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-gray-600 hover:text-gray-800"
            )}
          >
            Active queue ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setModuleTab("HISTORY")}
            className={cx(
              tabBtnBase,
              moduleTab === "HISTORY"
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-gray-600 hover:text-gray-800"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Archive className="w-4 h-4" />
              Completed history ({completedRequests.length})
            </span>
          </button>
        </div>

        {moduleTab === "ACTIVE" && (
        <SurfaceCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="w-5 h-5 text-violet-600" />
            <h2 className="font-bold text-gray-900">Scan to pack</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <input
              value={packerName}
              onChange={(e) => setPackerName(e.target.value.toUpperCase())}
              placeholder="Packer initials"
              className={`${fieldInput} font-bold uppercase tracking-widest`}
            />
            <form onSubmit={handleScan} className="sm:col-span-2">
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="Scan MK barcode on label…"
                className="w-full border-2 border-violet-300 rounded-lg px-4 py-3 text-sm font-mono text-gray-900 bg-violet-50 focus:ring-2 focus:ring-violet-500 outline-none"
                autoComplete="off"
              />
            </form>
          </div>
          {scanMessage && (
            <p
              className={cx(
                "text-sm font-medium px-3 py-2 rounded-lg",
                scanOk ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
              )}
            >
              {scanMessage}
            </p>
          )}
        </SurfaceCard>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <CenteredPage className="min-h-[40vh]">
            <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
          </CenteredPage>
        ) : moduleTab === "HISTORY" ? (
          completedRequests.length === 0 ? (
            <SurfaceCard className="p-12 text-center">
              <Archive className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No completed marketing shipments yet.</p>
              <p className="text-sm text-gray-500 mt-2">
                Orders appear here after they are marked shipped from the active queue.
              </p>
            </SurfaceCard>
          ) : (
            <SurfaceCard className="overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
                <h2 className="font-bold text-gray-900">Shipped orders</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Select rows to export packing and shipping audit data (who processed, when, and what was sent).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={
                            completedRequests.length > 0 &&
                            selectedIds.length === completedRequests.length
                          }
                          onChange={toggleSelectAllHistory}
                          aria-label="Select all completed orders"
                          className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                      </th>
                      <th className="px-4 py-3">Recipient</th>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3">Requested by</th>
                      <th className="px-4 py-3">Packed</th>
                      <th className="px-4 py-3">Shipped</th>
                      <th className="px-4 py-3 text-right">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRequests.map((req) => {
                      const isSelected = selectedIds.includes(req.id);
                      return (
                        <tr
                          key={req.id}
                          className={cx(
                            "border-t border-gray-100 cursor-pointer",
                            isSelected ? "bg-violet-50/60" : "hover:bg-gray-50"
                          )}
                          onClick={() => toggleSelection(req.id)}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(req.id)}
                              aria-label={`Select ${req.recipient_name}`}
                              className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">{req.recipient_name}</p>
                            <p className="text-xs text-gray-600">
                              {req.city}, {req.country}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-800">{req.barcode}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <p>{req.requested_by_name}</p>
                            <p className="text-xs text-gray-500">{formatWhen(req.created_at)}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <p className="font-semibold">{req.packed_by ?? "—"}</p>
                            <p className="text-xs text-gray-500">{formatWhen(req.packed_at)}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <p className="font-semibold">{req.shipped_by ?? "—"}</p>
                            <p className="text-xs text-gray-500">{formatWhen(req.shipped_at)}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {req.items?.length ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          )
        ) : requests.length === 0 ? (
          <SurfaceCard className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No pending marketing requests.</p>
          </SurfaceCard>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm text-gray-600">
                Select orders to batch print labels or mark pending orders packed with a manifest.
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requests.length > 0 && selectedIds.length === requests.length}
                  onChange={toggleSelectAllActive}
                  className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                Select all
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            {requests.map((req) => {
              const isSelected = selectedIds.includes(req.id);
              return (
              <SurfaceCard
                key={req.id}
                className={cx(
                  "p-5 flex flex-col relative",
                  isSelected && "ring-2 ring-violet-400 border-violet-200"
                )}
              >
                <div
                  className="absolute top-4 left-4 z-10 cursor-pointer p-1"
                  onClick={() => toggleSelection(req.id)}
                >
                  <div
                    className={cx(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                      isSelected ? "bg-violet-600 border-violet-600" : "bg-white border-gray-300 hover:border-gray-400"
                    )}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 mb-3 pl-8">
                  <div>
                    <p className="font-black text-lg text-gray-900">{req.recipient_name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {req.address_line1}
                      {req.address_line2 ? `, ${req.address_line2}` : ""}
                    </p>
                    <p className="text-sm text-gray-600">
                      {req.city}, {req.state} {req.postal_code}
                    </p>
                    <p className="text-sm text-gray-600">{req.country}</p>
                    {req.recipient_phone && (
                      <p className="text-sm font-semibold text-gray-800 mt-1">{req.recipient_phone}</p>
                    )}
                  </div>
                  <span
                    className={cx(
                      "text-xs font-bold uppercase px-2 py-1 rounded-full shrink-0",
                      statusStyles[req.status] ?? statusStyles.pending
                    )}
                  >
                    {req.status}
                  </span>
                </div>

                {(req.preferred_courier || req.due_date) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {req.preferred_courier && (
                      <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-violet-100 text-violet-800">
                        {req.preferred_courier}
                      </span>
                    )}
                    {req.due_date && (
                      <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">
                        Due {new Date(req.due_date + "T12:00:00").toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                <ul className="text-sm text-gray-700 border-t border-gray-100 pt-3 mb-4 space-y-1">
                  {(req.items ?? []).map((item) => (
                    <li key={item.id ?? `${item.product_name}-${item.qty}`}>
                      <span className="font-bold">{item.qty}×</span> {item.product_name}
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-gray-600 mb-4">
                  From {req.requested_by_name} · {new Date(req.created_at).toLocaleString()}
                </p>
                {req.notes && (
                  <p className="text-xs bg-amber-50 text-amber-900 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                    {req.notes}
                  </p>
                )}

                <RequestChat
                  requestId={req.id}
                  packageLabel={`${req.recipient_name} · ${req.barcode}`}
                  session={chatSession}
                />

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Link href={`/marketing/labels/${req.id}`} className="flex-1 min-w-[120px]">
                    <DashButton variant="primary" size="md" className="w-full">
                      <Printer className="w-4 h-4" /> Print label
                    </DashButton>
                  </Link>
                  {req.status === "packed" && (
                    <DashButton
                      variant="success"
                      size="md"
                      onClick={() => handleMarkShipped(req.id)}
                      className="flex-1 min-w-[120px]"
                    >
                      <Truck className="w-4 h-4" /> Shipped
                    </DashButton>
                  )}
                </div>
              </SurfaceCard>
            );
            })}
          </div>
          </>
        )}

        <p className="text-center text-xs text-gray-600">
          Marketing team submits at{" "}
          <Link href="/marketing" className="text-violet-600 font-semibold hover:underline">
            /marketing
          </Link>
        </p>
      </main>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 z-50 w-full max-w-3xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-xl bg-violet-100 text-violet-800">
              {selectedIds.length}
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">Orders selected</p>
              <p className="text-xs text-gray-600 font-medium">
                {moduleTab === "ACTIVE"
                  ? selectedPendingCount > 0
                    ? `${selectedPendingCount} pending · print labels or mark packed with manifest`
                    : "Batch print shipping labels"
                  : "Export audit CSV with pack/ship details"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashButton variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              <X className="w-4 h-4" /> Clear
            </DashButton>
            {moduleTab === "ACTIVE" ? (
              <>
                <DashButton variant="primary" size="md" onClick={handleBatchPrintLabels}>
                  <Printer className="w-4 h-4" /> Print labels
                </DashButton>
                <DashButton
                  variant="success"
                  size="md"
                  onClick={handleBatchMarkPacked}
                  disabled={batchPacking || selectedPendingCount === 0}
                >
                  {batchPacking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PackageCheck className="w-4 h-4" />
                  )}
                  Mark packed
                </DashButton>
              </>
            ) : (
              <DashButton variant="primary" size="md" onClick={handleExportSelected}>
                <Download className="w-4 h-4" /> Export CSV
              </DashButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
