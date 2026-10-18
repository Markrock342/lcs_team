"use client";

import { useEffect } from "react";
import { neonRequest } from "@/lib/neon/client";

const HEARTBEAT_MS = 60_000;

/** อัปเดต last_seen_at ใน Neon ตอนเปิดแอป ทุกหนึ่งนาที และเมื่อกลับมาที่แท็บ */
export function usePresenceHeartbeat() {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function touch() {
      await neonRequest("/api/neon/profiles", {
        method: "PATCH",
        body: JSON.stringify({ data: { last_seen_at: new Date().toISOString() } }),
      }).catch(() => undefined);
    }

    void touch();
    interval = setInterval(touch, HEARTBEAT_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void touch();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", touch);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", touch);
      void touch();
    };
  }, []);
}
