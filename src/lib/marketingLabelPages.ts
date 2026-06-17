import type { MarketingRequestItem } from "../types/marketing";

export type MarketingLabelItemDensity = "normal" | "compact" | "dense-2col";

export function marketingLabelItemDensity(itemCount: number): MarketingLabelItemDensity {
  if (itemCount > 18) return "dense-2col";
  if (itemCount > 10) return "compact";
  return "normal";
}

export function marketingLabelItemListClass(density: MarketingLabelItemDensity): string {
  switch (density) {
    case "dense-2col":
      return "grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-bold leading-tight";
    case "compact":
      return "space-y-0.5 text-xs font-bold leading-tight";
    default:
      return "space-y-1 text-sm font-bold leading-tight";
  }
}

const FIRST_PAGE_CAPACITY: Record<MarketingLabelItemDensity, number> = {
  normal: 11,
  compact: 13,
  "dense-2col": 14,
};

const CONTINUATION_PAGE_CAPACITY: Record<MarketingLabelItemDensity, number> = {
  normal: 18,
  compact: 22,
  "dense-2col": 24,
};

function firstPageCapacity(
  density: MarketingLabelItemDensity,
  addressLineCount: number,
  hasCourierBadges: boolean
): number {
  let capacity = FIRST_PAGE_CAPACITY[density];
  if (addressLineCount > 5) capacity -= 2;
  if (hasCourierBadges) capacity -= 1;
  return Math.max(capacity, 4);
}

function continuationPageCapacity(
  density: MarketingLabelItemDensity,
  hasNotes: boolean
): number {
  let capacity = CONTINUATION_PAGE_CAPACITY[density];
  if (hasNotes) capacity -= 3;
  return Math.max(capacity, 6);
}

/** Split items across fixed 100×150 mm label pages. */
export function splitMarketingLabelItems(
  items: MarketingRequestItem[],
  options: {
    addressLineCount: number;
    hasCourierBadges: boolean;
    hasNotes: boolean;
  }
): MarketingRequestItem[][] {
  if (items.length === 0) return [[]];

  const density = marketingLabelItemDensity(items.length);
  const firstCap = firstPageCapacity(
    density,
    options.addressLineCount,
    options.hasCourierBadges
  );

  if (items.length <= firstCap) return [items];

  const pages: MarketingRequestItem[][] = [items.slice(0, firstCap)];
  let remaining = items.slice(firstCap);
  const contCap = continuationPageCapacity(density, options.hasNotes);

  while (remaining.length > 0) {
    pages.push(remaining.slice(0, contCap));
    remaining = remaining.slice(contCap);
  }

  return pages;
}
