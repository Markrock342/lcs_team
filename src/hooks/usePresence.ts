"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { neonRequest } from "@/lib/neon/client";

type PresenceUser = {
  id: string;
  display_name: string;
};

const PRESENCE_POLL_MS = 15_000;
const TYPING_POLL_MS = 3_000;
const TYPING_THROTTLE_MS = 2_500;

/** สถานะออนไลน์จาก Neon last_seen_at; heartbeat จะอัปเดตทุกหนึ่งนาที */
export function useOnlinePresence(user: PresenceUser | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const stableUserId = userId;
    let cancelled = false;

    async function refresh() {
      try {
        const { profiles } = await neonRequest<{ profiles: PresenceUser[] }>(
          "/api/neon/profiles?presence=1",
          { cache: "no-store" },
        );
        if (!cancelled) setOnlineIds(new Set([stableUserId, ...profiles.map((profile) => profile.id)]));
      } catch {
        if (!cancelled) setOnlineIds(new Set([stableUserId]));
      }
    }

    void refresh();
    const interval = setInterval(refresh, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  return onlineIds;
}

/** Typing indicator เก็บสถานะหมดอายุสั้น ๆ ใน Neon และ polling เฉพาะช่องที่เปิดอยู่ */
export function useTypingIndicator(
  channelId: string | null,
  user: PresenceUser | null,
) {
  const [typingUsers, setTypingUsers] = useState<PresenceUser[]>([]);
  const lastSentRef = useRef(0);
  const userId = user?.id;

  useEffect(() => {
    if (!channelId || !userId) return;
    let cancelled = false;

    async function refresh() {
      try {
        const { users } = await neonRequest<{ users: PresenceUser[] }>(
          `/api/neon/chat?mode=typing&channelId=${encodeURIComponent(channelId!)}`,
          { cache: "no-store" },
        );
        if (!cancelled) setTypingUsers(users);
      } catch {
        if (!cancelled) setTypingUsers([]);
      }
    }

    void refresh();
    const interval = setInterval(refresh, TYPING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setTypingUsers([]);
      void neonRequest("/api/neon/chat", {
        method: "POST",
        body: JSON.stringify({ action: "stop-typing", data: { channel_id: channelId } }),
      }).catch(() => undefined);
    };
  }, [channelId, userId]);

  const notifyTyping = useCallback(() => {
    if (!channelId || !userId) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    void neonRequest("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "typing", data: { channel_id: channelId } }),
    }).catch(() => undefined);
  }, [channelId, userId]);

  const stopTyping = useCallback(() => {
    if (!channelId || !userId) return;
    lastSentRef.current = 0;
    void neonRequest("/api/neon/chat", {
      method: "POST",
      body: JSON.stringify({ action: "stop-typing", data: { channel_id: channelId } }),
    }).catch(() => undefined);
  }, [channelId, userId]);

  return { typingUsers, notifyTyping, stopTyping };
}
