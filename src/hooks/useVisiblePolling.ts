"use client";

import { useEffect, useRef } from "react";

type VisiblePollingOptions = {
  enabled?: boolean;
  runImmediately?: boolean;
};

/**
 * Poll only while the tab is visible and never overlap two executions.
 * A refresh is triggered when the user returns to a hidden tab.
 */
export function useVisiblePolling(
  callback: () => unknown | Promise<unknown>,
  intervalMs: number,
  options: VisiblePollingOptions = {},
) {
  const callbackRef = useRef(callback);
  const { enabled = true, runImmediately = true } = options;

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let running = false;

    async function run() {
      if (disposed || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await callbackRef.current();
      } catch {
        // Polling failures are transient; the next visible interval retries.
      } finally {
        running = false;
      }
    }

    if (runImmediately) void run();
    const interval = window.setInterval(() => void run(), intervalMs);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void run();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, runImmediately]);
}
