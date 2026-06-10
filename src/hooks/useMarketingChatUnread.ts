"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnreadChatCounts } from "../lib/marketingChatDb";
import type { MarketingSession } from "../types/marketing";

export function useMarketingChatUnread(session: MarketingSession | null) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [unreadByRequestId, setUnreadByRequestId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!session) {
      setTotalUnread(0);
      setUnreadByRequestId({});
      return;
    }

    try {
      const { total, byRequestId } = await fetchUnreadChatCounts(session);
      setTotalUnread(total);
      setUnreadByRequestId(byRequestId);
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

  return { totalUnread, unreadByRequestId, refreshUnread: refresh };
}
