"use client";

import { useState } from "react";
import { Loader2, LogOut, MessageSquare } from "lucide-react";
import { DashButton, SurfaceCard, fieldInput } from "../dashboard/primitives";
import { clearMarketingSession, setMarketingSession } from "../../lib/marketingAuth";
import { ForgotPinLink } from "./ForgotPinLink";
import { loginMarketingUser } from "../../lib/marketingDb";
import type { MarketingSession } from "../../types/marketing";

export function ChatLoginBar({
  session,
  onSessionChange,
}: {
  session: MarketingSession | null;
  onSessionChange: (session: MarketingSession | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const s = await loginMarketingUser(email, pin);
      setMarketingSession(s);
      onSessionChange(s);
      setPin("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearMarketingSession();
    onSessionChange(null);
  };

  if (session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="w-4 h-4 text-violet-700" />
          <span className="text-gray-700">
            Chatting as <span className="font-bold text-gray-900">{session.displayName}</span>
            <span className="ml-1 text-xs font-bold uppercase text-violet-700">({session.role})</span>
          </span>
        </div>
        <DashButton type="button" variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4" /> Sign out
        </DashButton>
      </div>
    );
  }

  return (
    <SurfaceCard className="p-4 mb-6">
      <p className="text-sm font-bold text-gray-900 mb-1">Sign in to use package discussions</p>
      <p className="text-xs text-gray-600 mb-3">Admins use fulfillment@aerisbeaute.com · Marketing uses your team email.</p>
      <form onSubmit={handleLogin} className="flex flex-wrap gap-2 items-end">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={`${fieldInput} max-w-xs`}
        />
        <input
          type="password"
          required
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className={`${fieldInput} max-w-[120px]`}
        />
        <DashButton type="submit" variant="primary" size="md" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
        </DashButton>
      </form>
      <ForgotPinLink email={email} />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </SurfaceCard>
  );
}
