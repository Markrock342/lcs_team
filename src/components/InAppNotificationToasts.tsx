"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AtSign, Bell, CheckSquare, Handshake, MessageCircle, Receipt, X } from "lucide-react";
import { getChatChannelIdFromLink } from "@/lib/channels";
import { inferNotificationKind } from "@/lib/notifications";
import { useNotifications } from "./NotificationProvider";
import type { AppNotification } from "@/lib/extras-types";

const KIND_ICON = { chat: MessageCircle, mention: AtSign, task: CheckSquare, system: Bell, sales: Handshake, invoice: Receipt } as const;
const DISMISS_MS = 8_000;

export function InAppNotificationToasts() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { items, incoming, markRead } = useNotifications();
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const handled = useRef(new Set<string>());
  const activeChannel = pathname === "/chat" ? searchParams.get("channel") : null;

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((previous) => previous.filter((item) => item.id !== id));
  }, []);
  const pause = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  };
  const resume = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS));
  }, [dismiss]);

  useEffect(() => {
    const fresh = incoming.filter((item) => {
      if (handled.current.has(item.id)) return false;
      handled.current.add(item.id);
      return !item.read && !item.muted && !item.silent && !(activeChannel && getChatChannelIdFromLink(item.link) === activeChannel);
    });
    if (handled.current.size > 1000) handled.current = new Set([...handled.current].slice(-500));
    if (!fresh.length) return;
    // The feed is an external event stream; retain the most recent three notices.
    setToasts((previous) => [...previous, ...fresh].slice(-3));
    fresh.forEach((item) => resume(item.id));
  }, [incoming, activeChannel, resume]);

  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  function open(item: AppNotification) {
    dismiss(item.id);
    // A read-state outage must never block navigation to the message.
    void markRead(item.id).catch(() => {});
    router.push(item.link ?? "/notifications");
  }

  return <section aria-label="การแจ้งเตือนใหม่" aria-live="polite" aria-relevant="additions"
    className="pointer-events-none fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-60 flex flex-col gap-2 lg:left-auto lg:right-6 lg:top-20 lg:w-96">
    {toasts.filter((item) => !items.find((current) => current.id === item.id)?.muted).map((item) => {
      const Icon = KIND_ICON[inferNotificationKind(item.title, item.link)];
      return <div key={item.id}
        onMouseEnter={() => pause(item.id)} onMouseLeave={() => resume(item.id)}
        onFocus={() => pause(item.id)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) resume(item.id); }}
        className="pointer-events-auto flex rounded-xl border border-border bg-card shadow-(--shadow-float) animate-toast-in">
        <button type="button" onClick={() => open(item)} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-4 text-left hover:bg-card-hover">
          <span className="shrink-0 rounded-lg bg-accent/10 p-2 text-accent"><Icon size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted">การแจ้งเตือนใหม่</span>
            <span className="block truncate text-sm font-semibold">{item.title}</span>
            {item.body && <span className="mt-1 line-clamp-2 block text-sm text-muted [overflow-wrap:anywhere]">{item.body}</span>}
          </span>
        </button>
        <button type="button" onClick={() => dismiss(item.id)} aria-label="ปิดการแจ้งเตือน"
          className="m-1 flex min-h-11 min-w-11 shrink-0 self-start items-center justify-center rounded-lg text-muted hover:bg-card-hover hover:text-foreground"><X size={16} /></button>
      </div>;
    })}
  </section>;
}
