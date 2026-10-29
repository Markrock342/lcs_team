"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, Bell, CheckSquare, Handshake, MessageCircle, Receipt } from "lucide-react";
import { useNotifications } from "@/components/NotificationProvider";
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
import { inboxActionsFor } from "@/lib/inbox-actions";
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
  mention: "bg-(--status-violet-bg) text-(--status-violet-fg)",
  task: "bg-(--status-amber-bg) text-(--status-amber-fg)",
  system: "bg-(--status-slate-bg) text-(--status-slate-fg)",
  sales: "bg-(--status-green-bg) text-(--status-green-fg)",
  invoice: "bg-(--status-blue-bg) text-(--status-blue-fg)",
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
  const { items, unreadCount, loading, error, refresh: load, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState("all");
  const visible = items.filter((item) => {
    if (filter === "unread") return !item.read;
    if (filter === "all") return true;
    return inferNotificationKind(item.title, item.link) === filter;
  });

  if (loading) {
    return <PageLoader label="กำลังโหลดการแจ้งเตือน..." />;
  }

  if (error && !items.length) {
    return (
      <PageShell width="medium">
        <ErrorState
          description={error}
          onRetry={() => void load()}
        />
      </PageShell>
    );
  }

  const unread = unreadCount;

  return (
    <PageShell width="medium">
      <PageHeader
        title="ศูนย์แจ้งเตือน"
        description={
          unread > 0 ? `ยังไม่ได้อ่าน ${unread} รายการ` : "อ่านครบแล้ว"
        }
        action={
          unread > 0 ? (
            <Button variant="secondary" onClick={() => void markAllRead().catch(() => {})}>
              อ่านทั้งหมด
            </Button>
          ) : undefined
        }
      />

      {error && <p role="status" className="rounded-xl bg-(--status-amber-bg) p-3 text-sm text-(--status-amber-fg)">{error}</p>}
      <div className="flex flex-wrap items-center gap-2" aria-label="กรองการแจ้งเตือน">
        {[["all", "ทั้งหมด"], ["unread", "ยังไม่อ่าน"], ["chat", "ข้อความ"], ["mention", "กล่าวถึงคุณ"]].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${filter === value ? "bg-accent/10 text-accent" : "text-muted hover:bg-card-hover"}`}>{label}</button>
        ))}
        <Link href="/settings" className="ml-auto flex min-h-11 items-center px-2 text-sm text-accent hover:underline">ตั้งค่าการแจ้งเตือน</Link>
      </div>
      <Card>
        <CardHeader
          title="การแจ้งเตือนล่าสุด"
          description={`แสดง ${visible.length} รายการล่าสุด · อัปเดตอัตโนมัติ`}
          icon={<Bell size={18} className="text-accent" />}
        />
        {visible.length > 0 ? (
          <div className="divide-y divide-border">
        {visible.map((n) => {
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
                  onClick={() => void markRead(n.id).catch(() => {})}
                  className="block hover:bg-card-hover"
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void markRead(n.id).catch(() => {})}
                  className="block w-full text-left hover:bg-card-hover"
                >
                  {content}
                </button>
              )}
              {!n.done_at && (
                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  {actions.map((action) =>
                    action.href ? (
                      <Link key={action.id} href={action.href} onClick={() => void markRead(n.id).catch(() => {})}>
                        <Button variant="secondary">{action.label}</Button>
                      </Link>
                    ) : (
                      <Button
                        key={action.id}
                        variant="secondary"
                        onClick={() => void markRead(n.id, true).catch(() => {})}
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
            title={filter === "all" ? "ยังไม่มีการแจ้งเตือน" : "ไม่มีรายการในตัวกรองนี้"}
            description="ข้อความ งาน และการกล่าวถึงใหม่จะแสดงที่นี่"
          />
        )}
      </Card>
    </PageShell>
  );
}
