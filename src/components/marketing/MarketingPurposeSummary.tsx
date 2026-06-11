import { SurfaceCard } from "../dashboard/primitives";
import type { MarketingRequest } from "../../types/marketing";

export type PurposeGroup = {
  purposeKey: string;
  label: string;
  requests: MarketingRequest[];
};

export function MarketingPurposeSummary({
  groups,
  totalLabel = "Total requests",
}: {
  groups: PurposeGroup[];
  totalLabel?: string;
}) {
  const total = groups.reduce((count, group) => count + group.requests.length, 0);

  return (
    <SurfaceCard className="p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="shrink-0">
          <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{total}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1.5">{totalLabel}</p>
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:border-l sm:border-gray-200 sm:pl-4">
            {groups.map((group) => (
              <span
                key={group.purposeKey || "__none__"}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-900 bg-violet-50 border border-violet-100 rounded-full px-3 py-1.5"
              >
                <span className="truncate max-w-[200px]" title={group.label}>
                  {group.label}
                </span>
                <span className="font-black tabular-nums text-violet-700">{group.requests.length}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}
