"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AtSign, Bell, CheckSquare, Handshake, MessageCircle, Receipt, X } from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import type { AppNotification } from "@/lib/extras-types";
import { getChatChannelIdFromLink } from "@/lib/channels";
import {
  inferNotificationKind,
  type NotificationKind,
} from "@/lib/notifications";

type ToastItem = {
  id: string;
  notificationId: string;
  title: string;
  body: string;
  link: string;
  kind: NotificationKind;
};

const AUTO_DISMISS_MS = 5000;
const MAX_TOASTS = 3;

const KIND_ICON = {
  chat: MessageCircle,
  mention: AtSign,
  task: CheckSquare,
  system: Bell,
  sales: Handshake,
  invoice: Receipt,
} as const;

const KIND_STYLE = {
  chat: "bg-accent/15 text-accent",
  mention: "bg-violet-500/15 text-violet-400",
  task: "bg-amber-500/15 text-amber-400",
  system: "bg-zinc-500/15 text-zinc-300",
  sales: "bg-emerald-500/15 text-emerald-300",
  invoice: "bg-sky-500/15 text-sky-300",
} as const;

export function InAppNotificationToasts({ userId }: { userId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const activeChatChannelId =
    pathname === "/chat" ? searchParams.get("channel") : null;

  const shouldSuppress = useCallback(
    (link: string | null) => {
      const channelId = getChatChannelIdFromLink(link);
      return (
        !!channelId &&
        pathname === "/chat" &&
        activeChatChannelId === channelId
      );
    },
    [pathname, activeChatChannelId]
  );

  const removeToast = useCallback((id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 280);

    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const enqueue = useCallback(
    (item: Omit<ToastItem, "id">) => {
      if (shouldSuppress(item.link)) return;

      const id = crypto.randomUUID();
      const toast: ToastItem = { ...item, id };

      setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));

      const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [removeToast, shouldSuppress]
  );

  const openToast = useCallback(
    async (toast: ToastItem) => {
      removeToast(toast.id);
      await neonRequest("/api/neon/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id: toast.notificationId, read: true }),
      });
      router.push(toast.link);
    },
    [removeToast, router]
  );

  useEffect(() => {
    let cancelled = false;
    const timers = timersRef.current;
    async function poll() {
      try {
        const { notifications } = await neonRequest<{ notifications: AppNotification[] }>(
          "/api/neon/notifications?limit=20",
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!initializedRef.current) {
          for (const notification of notifications) seenRef.current.add(notification.id);
          initializedRef.current = true;
          return;
        }
        for (const notification of [...notifications].reverse()) {
          if (seenRef.current.has(notification.id)) continue;
          seenRef.current.add(notification.id);
          enqueue({
            notificationId: notification.id,
            title: notification.title,
            body: notification.body ?? "",
            link: notification.link ?? "/notifications",
            kind: inferNotificationKind(notification.title, notification.link),
          });
        }
      } catch {
        // Polling failure must not interrupt the workspace.
      }
    }

    void poll();
    const interval = setInterval(poll, 8_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [userId, enqueue]);

  if (!toasts.length) return null;

  return (
    <div className="fixed inset-x-0 z-60 px-3 flex flex-col gap-2 pointer-events-none top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-3">
      {toasts.map((toast) => {
        const Icon = KIND_ICON[toast.kind];
        const exiting = exitingIds.has(toast.id);

        return (
          <div
            key={toast.id}
            className={
              exiting ? "animate-toast-out" : "animate-toast-in"
            }
          >
            <button
              type="button"
              onClick={() => openToast(toast)}
              className="pointer-events-auto w-full max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg text-left touch-manipulation"
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${KIND_STYLE[toast.kind]}`}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{toast.title}</p>
                {toast.body && (
                  <p className="text-sm text-muted mt-0.5 line-clamp-2">
                    {toast.body}
                  </p>
                )}
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    removeToast(toast.id);
                  }
                }}
                className="p-1 rounded-lg text-muted hover:text-foreground shrink-0 pointer-events-auto"
              >
                <X size={16} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
