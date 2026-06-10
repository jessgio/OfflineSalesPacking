"use client";

import { Package } from "lucide-react";
import { cx } from "../dashboard/primitives";

export function MarketingNewOrdersBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cx("relative inline-flex items-center justify-center", className)}
      title={`${count} new order${count === 1 ? "" : "s"} not yet opened`}
    >
      <Package className="w-5 h-5 text-amber-700" />
      <span className="absolute -top-1.5 -right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center leading-none">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
