"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Box, Loader2, Package, Plus } from "lucide-react";
import {
  AlertBanner,
  BackLink,
  BtnPrimary,
  EmptyState,
  MasterShipShell,
  PageTitle,
  SectionCard,
  StatusBadge,
  WorkflowSteps,
} from "../../components/master-ship/ui";
import {
  createPackingSession,
  fetchActivePurchaseOrders,
  fetchPackingSessions,
} from "../../lib/masterPackingDb";
import { getSupabaseErrorMessage } from "../../lib/supabaseError";
import type { PackingSession, PurchaseOrderRow } from "../../types/masterPacking";

export default function MasterShipHome() {
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [sessions, setSessions] = useState<PackingSession[]>([]);
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [setupHint, setSetupHint] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [poList, sessionList] = await Promise.all([
        fetchActivePurchaseOrders(),
        fetchPackingSessions(),
      ]);
      setPos(poList);
      setSessions(sessionList);
    } catch (e: unknown) {
      const msg = getSupabaseErrorMessage(e, "Failed to load data");
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
        setSetupHint(true);
        setError("Database tables not found. Run supabase/migrations/001_master_packing.sql in Supabase first.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const togglePo = (id: string) => {
    setSelectedPoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateSession = async () => {
    if (selectedPoIds.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const session = await createPackingSession(selectedPoIds);
      window.location.href = `/master-ship/${session.id}`;
    } catch (e: unknown) {
      const msg = getSupabaseErrorMessage(e, "Failed to create session");
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("42P01")) {
        setSetupHint(true);
        setError(
          "Master packing tables are missing. Run supabase/migrations/001_master_packing.sql in Supabase SQL editor."
        );
      } else if (msg.includes("42501") || msg.toLowerCase().includes("row-level security")) {
        setSetupHint(true);
        setError(
          `${msg} — Run supabase/migrations/002_master_packing_policies.sql in Supabase to allow writes.`
        );
      } else {
        setError(msg);
      }
      setCreating(false);
    }
  };

  return (
    <MasterShipShell className={selectedPoIds.length > 0 ? "pb-28" : "pb-12"}>
      <BackLink href="/" label="Fulfillment Dashboard" />
      <PageTitle
        title="Master Box Shipping"
        subtitle="Group multiple POs into outbound master cartons. Print master labels, scan inner LPNs into each master, then export a shipment manifest."
      />

      <div className="mb-8">
        <WorkflowSteps
          steps={[
            "Select POs for one shipment",
            "Create & print master box labels",
            "Scan master, then inner LPNs",
            "End packing → print manifest",
          ]}
        />
      </div>

      {error && <AlertBanner variant={setupHint ? "warning" : "error"}>{error}</AlertBanner>}

      {sessions.length > 0 && (
        <SectionCard
          title="Resume a session"
          description="Continue packing where you left off."
          icon={Box}
          className="mb-8"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/master-ship/${s.id}`}
                className="group flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-violet-100 bg-violet-50/30 hover:border-violet-400 hover:bg-violet-50 transition"
              >
                <div>
                  <p className="font-bold text-slate-900">Session {s.session_code}</p>
                  <div className="mt-2">
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-violet-600 group-hover:translate-x-0.5 transition" />
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Select purchase orders"
        description="Tick every PO that ships together in this batch. You can merge different retailers if they leave on the same pallet."
        icon={Package}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-violet-600">
            <Loader2 className="animate-spin w-8 h-8 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Loading active POs…</p>
          </div>
        ) : pos.length === 0 ? (
          <EmptyState
            message="No active purchase orders"
            hint="Upload POs on the main dashboard first, then return here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pos.map((po) => {
              const selected = selectedPoIds.includes(po.id);
              return (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => togglePo(po.id)}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    selected
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200 ring-offset-2"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition ${
                        selected ? "bg-violet-600 border-violet-600" : "bg-white border-slate-300"
                      }`}
                      aria-hidden
                    >
                      {selected && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">PO number</p>
                      <p className="font-bold text-slate-900 text-lg leading-tight mt-0.5">{po.po_number}</p>
                      <p className="text-sm text-violet-800 font-semibold mt-1">{po.retailer_name}</p>
                      <div className="mt-3">
                        <StatusBadge status={po.status} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {selectedPoIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700 text-center sm:text-left">
              <span className="text-violet-700 font-bold text-lg tabular-nums">{selectedPoIds.length}</span>
              {" "}PO{selectedPoIds.length === 1 ? "" : "s"} selected
            </p>
            <BtnPrimary
              onClick={handleCreateSession}
              disabled={creating || setupHint}
              className="w-full sm:w-auto py-3.5 text-base"
            >
              {creating ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
              Start master packing
            </BtnPrimary>
          </div>
        </div>
      )}
    </MasterShipShell>
  );
}
