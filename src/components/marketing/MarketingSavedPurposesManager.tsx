"use client";

import { useState } from "react";
import { Loader2, Tag, Trash2 } from "lucide-react";
import { DashButton, SurfaceCard, cx } from "../dashboard/primitives";
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

  if (!session) {
    return null;
  }

  const handleDelete = async (label: string) => {
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
    <SurfaceCard className={cx("p-4 border-violet-100 bg-violet-50/30", className)}>
      <div className="flex items-start gap-2 mb-3">
        <Tag className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-gray-900">Saved events &amp; purposes</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {onSelect
              ? "Click a tag to use it on this request. Use Remove to delete typos or mistakes from the saved list."
              : "Remove typos or mistakes from the saved list. Existing shipments are not changed."}
          </p>
        </div>
      </div>

      {purposes.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No saved purposes yet. They appear here after you submit a request with an event or purpose.
        </p>
      ) : (
        <ul className="space-y-2">
          {purposes.map((purpose) => {
            const isDeleting = deletingLabel === purpose;
            return (
              <li
                key={purpose}
                className="flex items-center gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2"
              >
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(purpose)}
                    className="flex-1 min-w-0 text-left text-sm font-semibold text-violet-900 hover:text-violet-700 truncate"
                    title={purpose}
                  >
                    {purpose}
                  </button>
                ) : (
                  <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate" title={purpose}>
                    {purpose}
                  </span>
                )}
                <DashButton
                  type="button"
                  variant="danger"
                  size="sm"
                  className="shrink-0"
                  disabled={isDeleting}
                  onClick={() => handleDelete(purpose)}
                  title={`Remove ${purpose}`}
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </>
                  )}
                </DashButton>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </SurfaceCard>
  );
}
