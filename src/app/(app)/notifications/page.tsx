"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, Bell, CheckSquare, Handshake, MessageCircle, Receipt } from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  PageLoader,
  StatusStamp,
} from "@/components/ui";
import { inferNotificationKind, type NotificationKind } from "@/lib/notifications";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";
import { inboxActionsFor } from "@/lib/inbox-actions";
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

const KIND_ICON_BG = {
  chat: "bg-accent/15 text-accent",
  mention: "bg-violet-500/15 text-violet-400",
  task: "bg-amber-500/15 text-amber-400",
  system: "bg-zinc-500/15 text-zinc-300",
  sales: "bg-emerald-500/15 text-emerald-300",
  invoice: "bg-sky-500/15 text-sky-300",
} as const;

const KIND_LABEL = {
  chat: "แชต",
  mention: "กล่าวถึง",
  task: "งาน",
  system: "ระบบ",
  sales: "ขาย",
  invoice: "เอกสาร",
} as const;

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <div className={`shrink-0 rounded-lg p-2 ${KIND_ICON_BG[kind]}`} aria-hidden="true">
      <Icon size={16} />
    </div>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useVisiblePolling(load, 30_000);

  async function load() {
    setError(null);
    try {
      const { notifications } = await neonRequest<{ notifications: AppNotification[] }>(
        "/api/neon/notifications?limit=50",
        { cache: "no-store" },
      );
      setItems(notifications);
    } catch {
      setError("โหลดการแจ้งเตือนไม่สำเร็จ ลองอีกครั้ง");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  async function markAllRead() {
    await neonRequest("/api/neon/notifications", {
      method: "PATCH",
      body: JSON.stringify({ all: true, read: true }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await neonRequest("/api/neon/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id, read: true }),
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  async function markDone(id: string) {
    await neonRequest("/api/neon/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id, read: true, done: true }),
    });
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true, done_at: new Date().toISOString() } : n
      )
    );
  }

  if (loading) {
    return <PageLoader label="กำลังโหลดการแจ้งเตือน..." />;
  }

  if (error) {
    return (
      <PageShell width="medium">
        <ErrorState
          description={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </PageShell>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <PageShell width="medium">
      <PageHeader
        title="กล่องงาน"
        description={
          unread > 0 ? `ยังไม่ได้อ่าน ${unread} รายการ` : "อ่านครบแล้ว"
        }
        action={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              อ่านทั้งหมด
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="รายการที่จัดการได้"
          description={`ทั้งหมด ${items.length} รายการ`}
          icon={<Bell size={18} className="text-accent" />}
        />
        {items.length > 0 ? (
          <div className="divide-y divide-border">
        {items.map((n) => {
          const kind = inferNotificationKind(n.title, n.link);
          const actions = inboxActionsFor(n);
          const content = (
            <ListRow
              className={n.done_at ? "opacity-60" : n.read ? undefined : "bg-surface-soft"}
              leading={<NotificationIcon kind={kind} />}
              title={<span className="block text-sm">{n.title}</span>}
              description={
                <div className="space-y-1">
                  {n.body && <p>{n.body}</p>}
                  <time className="block text-xs" dateTime={n.created_at}>
                  {formatDistanceToNow(new Date(n.created_at), {
                    addSuffix: true,
                    locale: th,
                  })}
                  </time>
                </div>
              }
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <StatusStamp label={KIND_LABEL[kind]} />
                  <StatusStamp
                    label={n.done_at ? "เสร็จแล้ว" : n.read ? "อ่านแล้ว" : "ยังไม่อ่าน"}
                    tone={n.done_at ? "green" : n.read ? "slate" : "blue"}
                  />
                </div>
              }
            />
          );

          return (
            <div key={n.id} className="space-y-2 py-1">
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => void markRead(n.id)}
                  className="block hover:bg-card-hover"
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void markRead(n.id)}
                  className="block w-full text-left hover:bg-card-hover"
                >
                  {content}
                </button>
              )}
              {!n.done_at && (
                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  {actions.map((action) =>
                    action.href ? (
                      <Link key={action.id} href={action.href} onClick={() => void markRead(n.id)}>
                        <Button variant="secondary">{action.label}</Button>
                      </Link>
                    ) : (
                      <Button
                        key={action.id}
                        variant="secondary"
                        onClick={() => void markDone(n.id)}
                      >
                        {action.label}
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
          </div>
        ) : (
          <EmptyState
            icon={<Bell size={28} />}
            title="ยังไม่มีการแจ้งเตือน"
            description="ข้อความ งาน และการกล่าวถึงใหม่จะแสดงที่นี่"
          />
        )}
      </Card>
    </PageShell>
  );
}
