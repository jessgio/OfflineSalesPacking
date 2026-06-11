"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Bell, MessageSquare } from "lucide-react";
import { cx } from "../dashboard/primitives";
import type { MarketingChatNotification } from "../../types/marketing";

function truncateBody(body: string, max = 120): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function notificationLabel(notification: MarketingChatNotification): string {
  if (notification.mentionsYou) return "Mentioned you";
  if (notification.isOnYourRequest) return "Reply on your request";
  return "New message";
}

export function MarketingChatNotifications({
  count,
  notifications,
  onSelectRequest,
  className,
}: {
  count: number;
  notifications: MarketingChatNotification[];
  onSelectRequest: (requestId: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex items-center justify-center rounded-lg p-2 text-violet-700 hover:bg-violet-50 hover:text-violet-900 transition-colors"
        aria-label={
          count > 0
            ? `${count} unread discussion message${count === 1 ? "" : "s"}`
            : "Discussion notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {count > 0 ? (
          <>
            <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-600 animate-notification-dot" />
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center leading-none">
              {count > 99 ? "99+" : count}
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-black text-gray-900">Notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {count > 0
                ? `${count} unread discussion message${count === 1 ? "" : "s"}`
                : "You're all caught up"}
            </p>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No unread messages
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {notifications.map((notification) => (
                <li key={notification.messageId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRequest(notification.requestId);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">{notification.authorName}</span>
                          <span
                            className={cx(
                              "inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full",
                              notification.mentionsYou
                                ? "bg-red-100 text-red-700"
                                : "bg-violet-100 text-violet-700"
                            )}
                          >
                            {notification.mentionsYou ? (
                              <AtSign className="w-3 h-3" />
                            ) : (
                              <MessageSquare className="w-3 h-3" />
                            )}
                            {notificationLabel(notification)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 line-clamp-2">{truncateBody(notification.body)}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {notification.recipientName} · {notification.barcode}
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
                        {formatWhen(notification.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
