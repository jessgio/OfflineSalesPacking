"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnreadChatData } from "../lib/marketingChatDb";
import type { MarketingChatNotification, MarketingSession } from "../types/marketing";

export function useMarketingChatUnread(session: MarketingSession | null) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [unreadByRequestId, setUnreadByRequestId] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<MarketingChatNotification[]>([]);

  const refresh = useCallback(async () => {
    if (!session) {
      setTotalUnread(0);
      setUnreadByRequestId({});
      setNotifications([]);
      return;
    }

    try {
      const { total, byRequestId, notifications: unreadNotifications } = await fetchUnreadChatData(session);
      setTotalUnread(total);
      setUnreadByRequestId(byRequestId);
      setNotifications(unreadNotifications);
    } catch {
      /* keep last known counts on transient errors */
    }
  }, [session]);

  useEffect(() => {
    refresh();
    if (!session) return;
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh, session]);

  return { totalUnread, unreadByRequestId, notifications, refreshUnread: refresh };
}
