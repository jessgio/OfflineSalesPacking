"use client";

import { Bell } from "lucide-react";
import { cx } from "../dashboard/primitives";

export function MarketingChatUnreadBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cx(
        "relative inline-flex items-center justify-center",
        className
      )}
      title={`${count} unread discussion message${count === 1 ? "" : "s"}`}
    >
      <Bell className="w-5 h-5 text-violet-700" />
      <span className="absolute -top-1.5 -right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center leading-none">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
