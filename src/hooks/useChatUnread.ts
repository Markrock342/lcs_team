"use client";

import { useCallback, useEffect, useState } from "react";
import { neonRequest } from "@/lib/neon/client";
import { CHAT_UNREAD_EVENT } from "@/lib/chat-workspace";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

export function useChatUnreadTotal() {
  const [total, setTotal] = useState(0);


  const refresh = useCallback(async () => {
    try {
      const { counts } = await neonRequest<{ counts: Record<string, number> }>(
        "/api/neon/chat?mode=sidebar",
        { cache: "no-store" },
      );
      setTotal(Object.values(counts).reduce((sum, n) => sum + n, 0));
    } catch {
      // Keep the last known badge count during transient network failures.
    }
  }, []);

  useVisiblePolling(refresh, 15_000);

  useEffect(() => {
    function onLocal() {
      void refresh();
    }
    window.addEventListener(CHAT_UNREAD_EVENT, onLocal);
    return () => {
      window.removeEventListener(CHAT_UNREAD_EVENT, onLocal);
    };
  }, [refresh]);

  return total;
}
