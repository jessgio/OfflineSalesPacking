"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnseenMarketingOrderCounts } from "../lib/marketingDb";
import type { MarketingSession } from "../types/marketing";

export function useMarketingUnseenOrders(session: MarketingSession | null) {
  const [totalUnseen, setTotalUnseen] = useState(0);
  const [unseenByRequestId, setUnseenByRequestId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!session || session.role !== "admin") {
      setTotalUnseen(0);
      setUnseenByRequestId({});
      return;
    }

    try {
      const { total, byRequestId } = await fetchUnseenMarketingOrderCounts(session);
      setTotalUnseen(total);
      setUnseenByRequestId(byRequestId);
    } catch {
      /* keep last known counts */
    }
  }, [session]);

  useEffect(() => {
    refresh();
    if (!session || session.role !== "admin") return;
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh, session]);

  return { totalUnseen, unseenByRequestId, refreshUnseen: refresh };
}
