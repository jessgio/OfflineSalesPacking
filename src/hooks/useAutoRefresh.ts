"use client";

import { useEffect } from "react";

export function useAutoRefresh(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void callback();
    }, intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs, enabled]);
}
