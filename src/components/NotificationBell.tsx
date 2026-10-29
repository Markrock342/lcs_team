"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AtSign, Bell, CheckSquare, Handshake, MessageCircle, Receipt } from "lucide-react";
import { useNotifications } from "./NotificationProvider";
import { getChatChannelIdFromLink } from "@/lib/channels";
import {
  inferNotificationKind,
} from "@/lib/notifications";
import type { AppNotification } from "@/lib/extras-types";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

const KIND_ICON = {
  chat: MessageCircle,
  mention: AtSign,
  task: CheckSquare,
  system: Bell,
  sales: Handshake,
  invoice: Receipt,
} as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unreadCount: count, loading, error, refresh: load, markRead, markAllRead } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeChatChannelId =
    pathname === "/chat" ? searchParams.get("channel") : null;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openItem(n: AppNotification) {
    if (!n.read) void markRead(n.id).catch(() => {});
    setOpen(false);
    router.push(n.link ?? "/notifications");
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
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-card-hover active:bg-card-hover touch-manipulation"
        aria-label={count ? `แจ้งเตือน ${count} รายการยังไม่อ่าน` : "แจ้งเตือน"}
        aria-expanded={open}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-(--shadow-float) lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-96">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div><p className="font-semibold text-sm">ศูนย์แจ้งเตือน</p><p className="mt-0.5 text-xs text-muted">{loading ? "กำลังเชื่อมต่อ…" : error ? "รอเชื่อมต่อใหม่" : "อัปเดตอัตโนมัติ"}</p></div>
            {count > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead().catch(() => {})}
                className="min-h-11 px-2 text-xs text-accent hover:underline touch-manipulation"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {error && <div role="status" className="bg-(--status-amber-bg) px-4 py-3 text-sm text-(--status-amber-fg)">
            <p>{error}</p><button type="button" onClick={() => void load()} className="min-h-11 font-medium underline">ลองเชื่อมต่ออีกครั้ง</button>
          </div>}
          <div className="max-h-80 overflow-y-auto overscroll-contain scroll-touch">
            {loading ? (<p className="py-8 text-center text-sm text-muted">กำลังโหลด…</p>) : items.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">ไม่มีแจ้งเตือน</p>
            ) : (
              items.slice(0, 12).map((n) => (
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
            className="block min-h-11 px-4 py-3 text-sm text-center text-accent border-t border-border hover:bg-card-hover"
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
        item.read || dimmed ? "" : "bg-accent/5"
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
        <p className="text-xs text-muted mt-1">
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
