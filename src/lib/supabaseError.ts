/** Supabase PostgrestError is not always instanceof Error. */
export function getSupabaseErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [o.message, o.details, o.hint, o.code ? `(${o.code})` : ""].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
