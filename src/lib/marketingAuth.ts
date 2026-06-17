import type { MarketingSession, RequesterDivision } from "../types/marketing";
import { normalizeUserRole } from "./marketingRoles";

const SESSION_KEY = "aeris_marketing_session";

export function normalizeRequesterDivision(value: string | null | undefined): RequesterDivision {
  const trimmed = value?.trim();
  if (trimmed === "Marketing" || trimmed === "R&D" || trimmed === "Leadership" || trimmed === "Operations") {
    return trimmed;
  }
  return "Other";
}

export function getMarketingSession(): MarketingSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketingSession;
    if (!parsed.email || !parsed.displayName) return null;
    return {
      email: parsed.email,
      displayName: parsed.displayName,
      role: normalizeUserRole(parsed.role),
      division: normalizeRequesterDivision(parsed.division),
    };
  } catch {
    return null;
  }
}

export function setMarketingSession(session: MarketingSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearMarketingSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function requestMarketingPinReminder(email: string): Promise<string> {
  const res = await fetch("/api/marketing-auth/send-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Could not send PIN email.");
  }
  return data.message ?? "If that email is registered, we sent your PIN.";
}
