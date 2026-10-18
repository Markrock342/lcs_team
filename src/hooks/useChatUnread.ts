"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { neonRequest } from "@/lib/neon/client";
import { CHAT_UNREAD_EVENT } from "@/lib/chat-workspace";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

export function useChatUnreadTotal() {
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  const isChatPage = pathname === "/chat";

  const refresh = useCallback(async () => {
    if (isChatPage) return;
    try {
      const { counts } = await neonRequest<{ counts: Record<string, number> }>(
        "/api/neon/chat?mode=sidebar",
        { cache: "no-store" },
      );
      setTotal(Object.values(counts).reduce((sum, n) => sum + n, 0));
    } catch {
      // Keep the last known badge count during transient network failures.
    }
  }, [isChatPage]);

  useVisiblePolling(refresh, 30_000, { enabled: !isChatPage });

  useEffect(() => {
    if (isChatPage) return;
    function onLocal() {
      void refresh();
    }
    window.addEventListener(CHAT_UNREAD_EVENT, onLocal);
    return () => {
      window.removeEventListener(CHAT_UNREAD_EVENT, onLocal);
    };
  }, [isChatPage, refresh]);

  return total;
}
