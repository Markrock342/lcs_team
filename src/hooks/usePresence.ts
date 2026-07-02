"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type PresenceUser = {
  id: string;
  display_name: string;
};

/**
 * Supabase Realtime Presence — ออนไลน์แบบเรียลไทม์ (join/leave ทันที)
 * แม่นกว่า last_seen_at heartbeat เพราะ track/untrack ตอนเชื่อม/ตัดการเชื่อมต่อ
 */
export function useOnlinePresence(user: PresenceUser | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            display_name: user.display_name,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.display_name]);

  return onlineIds;
}

const TYPING_TIMEOUT_MS = 4000;
const TYPING_THROTTLE_MS = 2500;

/**
 * Typing indicator ผ่าน Realtime broadcast — ไม่แตะ DB
 * notifyTyping() เรียกตอนพิมพ์, typingUsers = คนที่กำลังพิมพ์ (ยกเว้นตัวเอง)
 */
export function useTypingIndicator(
  channelId: string | null,
  user: PresenceUser | null
) {
  const [typingUsers, setTypingUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    if (!channelId || !user) return;
    const supabase = createClient();
    const timeouts = timeoutsRef.current;
    const channel = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as PresenceUser;
        if (p.id === user.id) return;

        setTypingUsers((prev) =>
          prev.some((u) => u.id === p.id) ? prev : [...prev, p]
        );

        const existing = timeouts.get(p.id);
        if (existing) clearTimeout(existing);
        timeouts.set(
          p.id,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.id !== p.id));
            timeouts.delete(p.id);
          }, TYPING_TIMEOUT_MS)
        );
      })
      .on("broadcast", { event: "stop_typing" }, ({ payload }) => {
        const p = payload as { id: string };
        setTypingUsers((prev) => prev.filter((u) => u.id !== p.id));
        const t = timeouts.get(p.id);
        if (t) {
          clearTimeout(t);
          timeouts.delete(p.id);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      setTypingUsers([]);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelId, user?.id]);

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { id: user.id, display_name: user.display_name },
    });
  }, [user?.id, user?.display_name]);

  const stopTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    lastSentRef.current = 0;
    channelRef.current.send({
      type: "broadcast",
      event: "stop_typing",
      payload: { id: user.id },
    });
  }, [user?.id]);

  return { typingUsers, notifyTyping, stopTyping };
}
