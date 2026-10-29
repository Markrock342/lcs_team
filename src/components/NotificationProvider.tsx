"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { neonRequest } from "@/lib/neon/client";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications";
import { notifyChatUnreadChanged } from "@/lib/chat-workspace";
import type { AppNotification } from "@/lib/extras-types";

type NotificationFeed = {
  items: AppNotification[];
  incoming: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string, done?: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationFeed | null>(null);

export function NotificationProvider({ userId, children }: { userId?: string; children: React.ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [incoming, setIncoming] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const startedAt = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    startedAt.current ??= Date.now();
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      try {
        const data = await neonRequest<{ notifications: AppNotification[]; unreadCount: number }>(
          "/api/neon/notifications?limit=50", { cache: "no-store" },
        );
        if (!mounted.current) return;
        const fresh = data.notifications.filter((item) =>
          !item.read && !item.muted && !item.silent && !seen.current.has(item.id) &&
          (initialized.current || Date.parse(item.created_at) >= (startedAt.current ?? Date.now())),
        );
        for (const item of data.notifications) seen.current.add(item.id);
        // Bound memory while retaining IDs across overlapping pages of results.
        if (seen.current.size > 1000) seen.current = new Set([...seen.current].slice(-500));
        initialized.current = true;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
        setError(null);
        if (fresh.length) {
          setIncoming(fresh.reverse());
          notifyChatUnreadChanged();
        }
      } catch {
        if (mounted.current) setError("เชื่อมต่อการแจ้งเตือนไม่สำเร็จ กำลังลองใหม่");
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    inFlight.current = request;
    try { await request; } finally { inFlight.current = null; }
  }, [userId]);

  useVisiblePolling(refresh, 5_000, { enabled: Boolean(userId) });

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    };
  }, [refresh]);

  useEffect(() => {
    const title = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = unreadCount ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${title}` : title;
    return () => { document.title = title; };
  }, [unreadCount]);

  const update = useCallback(async (body: { id?: string; all?: boolean; done?: boolean }) => {
    try {
      await neonRequest("/api/neon/notifications", {
        method: "PATCH", body: JSON.stringify({ ...body, read: true }),
      });
      // Wait out any pre-mutation snapshot before fetching the updated count.
      await inFlight.current;
      await refresh();
    } catch (cause) {
      setError("บันทึกสถานะการแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง");
      throw cause;
    }
  }, [refresh]);

  const markRead = useCallback((id: string, done = false) => update({ id, done }), [update]);
  const markAllRead = useCallback(() => update({ all: true }), [update]);

  return <NotificationContext.Provider value={{ items, incoming, unreadCount, loading, error, refresh, markRead, markAllRead }}>
    {children}
  </NotificationContext.Provider>;
}

export function useNotifications() {
  const feed = useContext(NotificationContext);
  if (!feed) throw new Error("NotificationProvider is required");
  return feed;
}
