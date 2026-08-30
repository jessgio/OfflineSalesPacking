function normalizeSiteUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function siteUrlFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && !origin.includes("localhost")) {
    try {
      return normalizeSiteUrl(new URL(origin).origin);
    } catch {
      // ignore malformed origin
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && !host.startsWith("localhost")) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return normalizeSiteUrl(`${proto}://${host.split(",")[0].trim()}`);
  }

  return null;
}

/** Public site origin for links in emails, Lark cards, and other outbound messages. */
export function getSiteUrl(request?: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (fromEnv?.trim()) {
    return normalizeSiteUrl(fromEnv.trim());
  }

  if (request) {
    const fromRequest = siteUrlFromRequest(request);
    if (fromRequest) return fromRequest;
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) {
    return normalizeSiteUrl(`https://${vercelHost}`);
  }

  if (process.env.NODE_ENV === "production") {
    return "https://aerisbeaute.com";
  }

  return "http://localhost:3000";
}
