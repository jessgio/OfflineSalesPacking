"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { cx } from "../dashboard/primitives";
import { deleteMarketingRequestPurpose } from "../../lib/marketingDb";
import type { MarketingSession } from "../../types/marketing";

export function MarketingSavedPurposesManager({
  purposes,
  session,
  onUpdated,
  onSelect,
  className,
}: {
  purposes: string[];
  session: MarketingSession | null;
  onUpdated: () => void;
  onSelect?: (purpose: string) => void;
  className?: string;
}) {
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!session || purposes.length === 0) {
    return null;
  }

  const handleDelete = async (label: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    const confirmed = window.confirm(
      `Remove "${label}" from saved purposes and events?\n\nExisting shipments keep their purpose; this only removes the saved suggestion.`
    );
    if (!confirmed) return;

    setDeletingLabel(label);
    setError("");
    try {
      await deleteMarketingRequestPurpose(session, label);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete purpose");
    } finally {
      setDeletingLabel(null);
    }
  };

  return (
    <div className={cx("space-y-1", className)}>
      <label className="block text-xs font-semibold text-gray-700">Recent purposes</label>
      <div
        className="rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden max-h-56 overflow-y-auto"
        role="listbox"
        aria-label="Recent purposes"
      >
        {purposes.map((purpose) => {
          const isDeleting = deletingLabel === purpose;
          return (
            <div
              key={purpose}
              role="option"
              className="flex items-center gap-2 border-b border-gray-100 last:border-b-0 hover:bg-violet-50"
            >
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(purpose)}
                  className="flex-1 min-w-0 text-left px-3 py-2.5 text-sm text-gray-900 hover:text-violet-800 truncate"
                  title={purpose}
                >
                  {purpose}
                </button>
              ) : (
                <span
                  className="flex-1 min-w-0 px-3 py-2.5 text-sm text-gray-900 truncate"
                  title={purpose}
                >
                  {purpose}
                </span>
              )}
              <button
                type="button"
                onClick={(event) => handleDelete(purpose, event)}
                disabled={isDeleting}
                className="shrink-0 p-2 mr-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                title={`Remove ${purpose}`}
                aria-label={`Remove ${purpose}`}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500">
        Click a row to use it. Click <span className="font-semibold">×</span> to remove typos from the saved list.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
