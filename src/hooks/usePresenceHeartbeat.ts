"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_MS = 60_000;

/** อัปเดต last_seen_at ตอนเปิดแอพ + ทุก 1 นาที + ตอนกลับมา tab */
export function usePresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let interval: ReturnType<typeof setInterval> | null = null;

    async function touch() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    touch();
    interval = setInterval(touch, HEARTBEAT_MS);

    function onVisible() {
      if (document.visibilityState === "visible") touch();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", touch);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", touch);
      touch();
    };
  }, []);
}
