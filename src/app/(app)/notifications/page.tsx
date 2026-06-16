"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Bell, CheckSquare, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { Button } from "@/components/ui";
import { inferNotificationKind, type NotificationKind } from "@/lib/notifications";
import type { AppNotification } from "@/lib/extras-types";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

const KIND_ICON = {
  chat: MessageCircle,
  mention: AtSign,
  task: CheckSquare,
  system: Bell,
} as const;

const KIND_ICON_BG = {
  chat: "bg-accent/15 text-accent",
  mention: "bg-violet-500/15 text-violet-400",
  task: "bg-amber-500/15 text-amber-400",
  system: "bg-zinc-500/15 text-zinc-300",
} as const;

const KIND_BORDER = {
  chat: "border-accent/30 bg-accent/5",
  mention: "border-violet-500/30 bg-violet-500/5",
  task: "border-amber-500/30 bg-amber-500/5",
  system: "border-border bg-card",
} as const;

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <div className={`p-2 rounded-lg shrink-0 ${KIND_ICON_BG[kind]}`}>
      <Icon size={16} />
    </div>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel("notifications-page")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const n = payload.new as AppNotification;
            setItems((prev) => {
              if (prev.some((i) => i.id === n.id)) return prev;
              return [n, ...prev].slice(0, 50);
            });
          }
        )
        .subscribe();
    }

    subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data ?? []);
    setLoading(false);
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
      .eq("user_id", user.id);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="แจ้งเตือน"
        description={
          unread > 0 ? `${unread} ยังไม่ได้อ่าน` : "อ่านครบแล้ว"
        }
        action={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              อ่านทั้งหมด
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-2">
        {items.map((n) => {
          const kind = inferNotificationKind(n.title, n.link);
          const content = (
            <div className="flex items-start gap-3">
              <NotificationIcon kind={kind} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{n.title}</p>
                {n.body && (
                  <p className="text-sm text-muted mt-0.5">{n.body}</p>
                )}
                <p className="text-[10px] text-muted mt-1">
                  {formatDistanceToNow(new Date(n.created_at), {
                    addSuffix: true,
                    locale: th,
                  })}
                </p>
              </div>
              {!n.read && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
              )}
            </div>
          );

          return (
            <div
              key={n.id}
              className={`p-4 rounded-xl border transition-colors ${
                n.read
                  ? "bg-card border-border opacity-70"
                  : KIND_BORDER[kind]
              }`}
            >
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => markRead(n.id)}
                  className="block"
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="block w-full text-left"
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-center text-muted py-12">ไม่มีแจ้งเตือน</p>
        )}
      </div>
    </div>
  );
}
