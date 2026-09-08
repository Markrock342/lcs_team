"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
      const { data: channels } = await supabase.from("channels").select("id");
      const ids = (channels ?? []).map((row) => row.id);
      const counts = await fetchUnreadCounts(supabase, user.id, ids);
      if (!cancelled) {
        setTotal(Object.values(counts).reduce((sum, n) => sum + n, 0));
      }
    }

    void refresh();
    const sub = supabase
      .channel("nav-chat-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void refresh();
        }
      )
      .subscribe();

    function onLocal() {
      void refresh();
    }
    window.addEventListener(CHAT_UNREAD_EVENT, onLocal);
    const tick = window.setInterval(() => void refresh(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener(CHAT_UNREAD_EVENT, onLocal);
      window.clearInterval(tick);
      supabase.removeChannel(sub);
    };
  }, [pathname]);

  return total;
}
