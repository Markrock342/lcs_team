"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AtSign, Bell, CheckSquare, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getChatChannelIdFromLink } from "@/lib/channels";
import {
  inferNotificationKind,
  type NotificationKind,
} from "@/lib/notifications";
import type { AppNotification } from "@/lib/extras-types";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

const KIND_ICON = {
  chat: MessageCircle,
  mention: AtSign,
  task: CheckSquare,
  system: Bell,
} as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [count, setCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/:/g, "");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeChatChannelId =
    pathname === "/chat" ? searchParams.get("channel") : null;

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, count: unread, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) return false;

    setItems(data ?? []);
    setCount(unread ?? 0);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const ok = await load();
      if (cancelled || !ok) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel(`notif-bell-${instanceId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            load();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            load();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    let cleanup: (() => void) | undefined;
    init().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [instanceId, load]);

  useEffect(() => {
    if (!activeChatChannelId) return;
    load();
  }, [activeChatChannelId, load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
  }

  async function openItem(n: AppNotification) {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
    else router.push("/notifications");
  }

  function shouldDimInPanel(n: AppNotification) {
    const channelId = getChatChannelIdFromLink(n.link);
    return (
      !!channelId &&
      pathname === "/chat" &&
      activeChatChannelId === channelId &&
      !n.read
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative p-2 rounded-lg hover:bg-card-hover active:bg-card-hover touch-manipulation"
        aria-label="แจ้งเตือน"
        aria-expanded={open}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(100vw-1.5rem,22rem)] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm">แจ้งเตือน</p>
            {count > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-accent hover:underline touch-manipulation"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-contain scroll-touch">
            {items.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">ไม่มีแจ้งเตือน</p>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  dimmed={shouldDimInPanel(n)}
                  onOpen={() => openItem(n)}
                />
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-xs text-center text-accent border-t border-border hover:bg-card-hover"
          >
            ดูทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  dimmed,
  onOpen,
}: {
  item: AppNotification;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const kind = inferNotificationKind(item.title, item.link);
  const Icon = KIND_ICON[kind];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-card-hover transition-colors touch-manipulation ${
        item.read || dimmed ? "opacity-60" : "bg-accent/5"
      }`}
    >
      <div className="p-1.5 rounded-lg bg-accent/10 text-accent shrink-0 mt-0.5">
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.body && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{item.body}</p>
        )}
        <p className="text-[10px] text-muted mt-1">
          {formatDistanceToNow(new Date(item.created_at), {
            addSuffix: true,
            locale: th,
          })}
        </p>
      </div>
      {!item.read && !dimmed && (
        <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
      )}
    </button>
  );
}
