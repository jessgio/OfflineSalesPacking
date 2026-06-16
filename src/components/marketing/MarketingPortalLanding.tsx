"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogOut, Megaphone, Package } from "lucide-react";
import {
  CenteredPage,
  DashButton,
  SurfaceCard,
  cx,
  fieldInput,
} from "../dashboard/primitives";
import {
  clearMarketingSession,
  getMarketingSession,
  setMarketingSession,
} from "../../lib/marketingAuth";
import { loginMarketingUser, refreshMarketingSession } from "../../lib/marketingDb";
import {
  canAccessFulfillPortal,
  canAccessRequestPortal,
  roleLabel,
} from "../../lib/marketingRoles";
import type { MarketingSession } from "../../types/marketing";

export type MarketingPortalChoice = "marketing" | "fulfill";

function portalFromParam(value: string | null): MarketingPortalChoice | null {
  if (value === "marketing" || value === "fulfill") return value;
  return null;
}

function portalHref(portal: MarketingPortalChoice): string {
  return portal === "marketing" ? "/marketing" : "/marketing/fulfill";
}

function canAccessPortal(session: MarketingSession, portal: MarketingPortalChoice): boolean {
  return portal === "marketing" ? canAccessRequestPortal(session) : canAccessFulfillPortal(session);
}

function portalLabel(portal: MarketingPortalChoice): string {
  return portal === "marketing" ? "Marketing portal" : "Packing portal";
}

export function MarketingPortalLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portalParam = portalFromParam(searchParams.get("portal"));

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<MarketingSession | null>(null);
  const [selectedPortal, setSelectedPortal] = useState<MarketingPortalChoice>(
    portalParam ?? "marketing"
  );
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (portalParam) {
      setSelectedPortal(portalParam);
    }
  }, [portalParam]);

  useEffect(() => {
    const stored = getMarketingSession();
    if (!stored) {
      setBooting(false);
      return;
    }
    void refreshMarketingSession(stored)
      .then((refreshed) => {
        setMarketingSession(refreshed);
        setSession(refreshed);
      })
      .catch(() => {
        setSession(stored);
      })
      .finally(() => {
        setBooting(false);
      });
  }, []);

  const handleContinue = useCallback(
    (portal: MarketingPortalChoice) => {
      if (!session) return;
      if (!canAccessPortal(session, portal)) {
        setLoginError(
          portal === "marketing"
            ? `Your ${roleLabel(session.role)} account uses the packing portal. Select Packing portal to continue.`
            : `Your ${roleLabel(session.role)} account uses the marketing portal. Select Marketing portal to continue.`
        );
        setSelectedPortal(portal === "marketing" ? "fulfill" : "marketing");
        return;
      }
      router.push(portalHref(portal));
    },
    [router, session]
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const loggedIn = await loginMarketingUser(email, pin);
      setMarketingSession(loggedIn);
      setSession(loggedIn);
      setPin("");

      if (!canAccessPortal(loggedIn, selectedPortal)) {
        const alternate: MarketingPortalChoice =
          selectedPortal === "marketing" ? "fulfill" : "marketing";
        if (canAccessPortal(loggedIn, alternate)) {
          setSelectedPortal(alternate);
          setLoginError(
            `Signed in as ${roleLabel(loggedIn.role)}. Switched to ${portalLabel(alternate).toLowerCase()}.`
          );
          router.push(portalHref(alternate));
          return;
        }
        setLoginError(`This account (${roleLabel(loggedIn.role)}) cannot access either portal.`);
        return;
      }

      router.push(portalHref(selectedPortal));
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearMarketingSession();
    setSession(null);
    setLoginError("");
  };

  if (booting) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
      <div className="max-w-lg w-full mx-auto text-center px-4">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-600 mb-2">
          Aeris Beaute
        </p>
        <h1 className="text-3xl font-black text-gray-900 mb-2">Marketing Fulfillment</h1>
        <p className="text-sm text-gray-600 mb-8">
          Request marketing shipments or pack and dispatch orders from the warehouse.
        </p>

        {session && (
          <SurfaceCard className="p-4 mb-6 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-700">
                Signed in as{" "}
                <span className="font-bold text-gray-900">{session.displayName}</span>
                <span className="ml-1 text-xs font-bold uppercase text-violet-700">
                  ({roleLabel(session.role)})
                </span>
              </p>
              <DashButton type="button" variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> Sign out
              </DashButton>
            </div>
          </SurfaceCard>
        )}

        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          <PortalCard
            icon={Megaphone}
            title="Marketing portal"
            description="Create and track shipment requests"
            selected={selectedPortal === "marketing"}
            onSelect={() => {
              setSelectedPortal("marketing");
              setLoginError("");
              if (session) handleContinue("marketing");
            }}
          />
          <PortalCard
            icon={Package}
            title="Packing portal"
            description="Scan, pack, label, and ship requests"
            selected={selectedPortal === "fulfill"}
            onSelect={() => {
              setSelectedPortal("fulfill");
              setLoginError("");
              if (session) handleContinue("fulfill");
            }}
          />
        </div>

        {!session ? (
          <SurfaceCard className="p-6 text-left">
            <p className="text-sm font-bold text-gray-900 mb-1">
              Sign in to {portalLabel(selectedPortal).toLowerCase()}
            </p>
            <p className="text-xs text-gray-600 mb-4">
              Use your team email and PIN. Marketing and R&amp;D use the marketing portal; warehouse
              staff use the packing portal.
            </p>
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldInput}
                  placeholder="you@aerisbeaute.com"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1">PIN</label>
                <input
                  type="password"
                  required
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={fieldInput}
                  placeholder="••••"
                  autoComplete="current-password"
                />
              </div>
              {loginError && <p className="text-sm text-red-600 font-medium">{loginError}</p>}
              <DashButton type="submit" variant="pink" size="lg" className="w-full" disabled={loggingIn}>
                {loggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Sign in &amp; continue
              </DashButton>
            </form>
          </SurfaceCard>
        ) : (
          <div className="space-y-3">
            {loginError && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}
            <DashButton
              type="button"
              variant="pink"
              size="lg"
              className="w-full"
              onClick={() => handleContinue(selectedPortal)}
            >
              Continue to {portalLabel(selectedPortal).toLowerCase()}
            </DashButton>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-8">
          Offline sales PO dashboard ·{" "}
          <Link href="/dashboard" className="font-semibold text-violet-600 hover:underline">
            Open packing dashboard
          </Link>
        </p>
      </div>
    </CenteredPage>
  );
}

function PortalCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: typeof Megaphone;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="group text-left w-full">
      <SurfaceCard
        className={cx(
          "p-6 h-full transition-shadow hover:shadow-md",
          selected && "ring-2 ring-violet-500 shadow-md"
        )}
      >
        <Icon className="w-8 h-8 text-violet-600 mb-3" />
        <h2 className="font-bold text-gray-900 group-hover:text-violet-700">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </SurfaceCard>
    </button>
  );
}
