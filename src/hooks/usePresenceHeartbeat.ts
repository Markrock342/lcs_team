"use client";

import { useCallback } from "react";
import { neonRequest } from "@/lib/neon/client";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

const HEARTBEAT_MS = 60_000;

/** อัปเดต last_seen_at ใน Neon ตอนเปิดแอป ทุกหนึ่งนาที และเมื่อกลับมาที่แท็บ */
export function usePresenceHeartbeat() {
  const touch = useCallback(async () => {
    await neonRequest("/api/neon/profiles", {
      method: "PATCH",
      body: JSON.stringify({ data: { last_seen_at: new Date().toISOString() } }),
    }).catch(() => undefined);
  }, []);

  useVisiblePolling(touch, HEARTBEAT_MS);
}
