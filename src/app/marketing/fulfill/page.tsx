"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Package,
  Printer,
  ScanLine,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard, cx, fieldInput } from "../../../components/dashboard/primitives";
import { ChatLoginBar } from "../../../components/marketing/ChatLoginBar";
import { RequestChat } from "../../../components/marketing/RequestChat";
import { getMarketingSession } from "../../../lib/marketingAuth";
import type { MarketingSession } from "../../../types/marketing";
import {
  fetchMarketingRequestByBarcode,
  fetchPendingMarketingRequests,
  markMarketingRequestPacked,
  markMarketingRequestShipped,
} from "../../../lib/marketingDb";
import { isMarketingBarcode } from "../../../lib/marketingBarcode";
import type { MarketingRequest } from "../../../types/marketing";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
};

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
  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packerName, setPackerName] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanOk, setScanOk] = useState<boolean | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [chatSession, setChatSession] = useState<MarketingSession | null>(null);

  useEffect(() => {
    setChatSession(getMarketingSession());
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPendingMarketingRequests();
      setRequests(data);
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
    try {
      await markMarketingRequestShipped(id);
      await loadQueue();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <CenteredPage className="min-h-[40vh]">
            <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
          </CenteredPage>
        ) : requests.length === 0 ? (
          <SurfaceCard className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No pending marketing requests.</p>
          </SurfaceCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {requests.map((req) => (
              <SurfaceCard key={req.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
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
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-600">
          Marketing team submits at{" "}
          <Link href="/marketing" className="text-violet-600 font-semibold hover:underline">
            /marketing
          </Link>
        </p>
      </main>
    </div>
  );
}
