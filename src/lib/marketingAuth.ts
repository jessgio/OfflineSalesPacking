import type { MarketingSession } from "../types/marketing";

const SESSION_KEY = "aeris_marketing_session";

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
      role: parsed.role === "admin" ? "admin" : "marketing",
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
