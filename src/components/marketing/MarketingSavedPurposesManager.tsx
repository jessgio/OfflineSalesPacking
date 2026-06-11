"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cx, fieldInput } from "../dashboard/primitives";
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
  const [open, setOpen] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

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

  const handleSelect = (purpose: string) => {
    onSelect?.(purpose);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cx("space-y-1", className)}>
      <label id="recent-purposes-label" className="block text-xs font-semibold text-gray-700">
        Recent purposes
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cx(
            fieldInput,
            "w-full flex items-center justify-between gap-2 text-left text-sm text-gray-600"
          )}
          aria-labelledby="recent-purposes-label"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">
            Select a saved event / purpose ({purposes.length})
          </span>
          <ChevronDown
            className={cx("w-4 h-4 shrink-0 text-gray-500 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-300 bg-white shadow-lg overflow-hidden"
            role="listbox"
            aria-label="Recent purposes"
          >
            <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100">
              {purposes.map((purpose) => {
                const isDeleting = deletingLabel === purpose;
                return (
                  <li
                    key={purpose}
                    role="option"
                    className="flex items-center gap-2 hover:bg-violet-50"
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => handleSelect(purpose)}
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
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <p className="text-[11px] text-gray-500">
          Click a row to use it. Click <span className="font-semibold">×</span> to remove typos from the
          saved list.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
