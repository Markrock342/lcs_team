"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neonRequest } from "@/lib/neon/client";
import type { Channel } from "@/lib/types";
import {
  CHAT_UNREAD_EVENT,
  fetchUnreadCounts,
} from "@/lib/chat-workspace";

export function useChatUnreadTotal() {
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { channels } = await neonRequest<{ channels: Channel[] }>("/api/neon/chat?mode=channels", { cache: "no-store" });
      const ids = channels.map((row) => row.id);
      const counts = await fetchUnreadCounts(supabase, user.id, ids);
      if (!cancelled) {
        setTotal(Object.values(counts).reduce((sum, n) => sum + n, 0));
      }
    }

    void refresh();
    function onLocal() {
      void refresh();
    }
    window.addEventListener(CHAT_UNREAD_EVENT, onLocal);
    const tick = window.setInterval(() => void refresh(), 10_000);

    return () => {
      cancelled = true;
      window.removeEventListener(CHAT_UNREAD_EVENT, onLocal);
      window.clearInterval(tick);
    };
  }, [pathname]);

  return total;
}
