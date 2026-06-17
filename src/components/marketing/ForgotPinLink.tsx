"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { requestMarketingPinReminder } from "../../lib/marketingAuth";

export function ForgotPinLink({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleClick = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above first.");
      setMessage("");
      return;
    }

    setSending(true);
    setError("");
    setMessage("");
    try {
      const successMessage = await requestMarketingPinReminder(trimmed);
      setMessage(successMessage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send PIN email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={sending}
        className="text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline disabled:opacity-60"
      >
        {sending ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending…
          </span>
        ) : (
          "Forgot PIN? Email it to me"
        )}
      </button>
      {message && <p className="text-xs text-green-700 mt-1">{message}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
