"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnseenMarketingOrderCounts } from "../lib/marketingDb";
import { canFulfill } from "../lib/marketingRoles";
import type { MarketingSession } from "../types/marketing";

export function useMarketingUnseenOrders(session: MarketingSession | null) {
  const [totalUnseen, setTotalUnseen] = useState(0);
  const [unseenByRequestId, setUnseenByRequestId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!session || !canFulfill(session)) {
      setTotalUnseen(0);
      setUnseenByRequestId({});
      return;
    }
    try {
      const { total, byRequestId } = await fetchUnseenMarketingOrderCounts(session);
      setTotalUnseen(total);
      setUnseenByRequestId(byRequestId);
    } catch {
      setTotalUnseen(0);
      setUnseenByRequestId({});
    }
  }, [session]);

  useEffect(() => {
    if (!session || !canFulfill(session)) return;
    void refresh();
  }, [session, refresh]);

  return { totalUnseen, unseenByRequestId, refreshUnseen: refresh };
}
