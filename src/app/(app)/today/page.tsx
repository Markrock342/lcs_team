"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, CheckSquare, Receipt, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import { Button, Card, CardHeader, EmptyState, ErrorState, PageLoader, StatusStamp } from "@/components/ui";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import type { Task, SalesDeal, SalesProspect, Channel, Profile } from "@/lib/types";
import type { AppNotification, Invoice } from "@/lib/extras-types";
import { chatChannelHref } from "@/lib/channels";
import { channelTitle, fetchUnreadCounts } from "@/lib/chat-workspace";

type DayItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "blue" | "amber" | "red" | "violet" | "slate";
};

export default function TodayPage() {
  const { profile } = useRole();
  const [items, setItems] = useState<DayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("เข้าสู่ระบบอีกครั้ง");
      setLoading(false);
      return;
    }

    const [tasksRes, dealsRes, prospectsRes, invoicesRes, notifRes, channelsRes, profilesRes] = await Promise.all([
      supabase.from("tasks").select("id, title, due_date, status, assigned_to").neq("status", "done").order("due_date"),
      supabase.from("sales_deals").select("id, title, next_follow_up, stage, owner_id").not("next_follow_up", "is", null),
      supabase.from("sales_prospects").select("id, name, next_follow_up, status, owner_id").not("next_follow_up", "is", null),
      supabase.from("invoices").select("id, title, due_date, status, total_amount").in("status", ["sent", "partial", "overdue"]),
      supabase.from("notifications").select("*").eq("user_id", user.id).eq("read", false).order("created_at", { ascending: false }).limit(8),
      supabase.from("channels").select("*"),
      supabase.from("profiles").select("id, display_name"),
    ]);

    const next: DayItem[] = [];
    for (const task of (tasksRes.data ?? []) as Task[]) {
      if (profile?.id && task.assigned_to && task.assigned_to !== profile.id) continue;
      if (task.due_date && task.due_date <= soon) {
        next.push({
          id: `task-${task.id}`,
          title: task.title,
          detail: `${TASK_STATUS_LABELS[task.status]} · ครบ ${task.due_date}`,
          href: "/tasks",
          action: "ทำต่องาน",
          tone: task.due_date < today ? "red" : "amber",
        });
      }
    }
    for (const deal of (dealsRes.data ?? []) as SalesDeal[]) {
      if (deal.next_follow_up && deal.next_follow_up <= today && deal.stage !== "won" && deal.stage !== "lost") {
        next.push({
          id: `deal-${deal.id}`,
          title: deal.title,
          detail: `นัดติดตามดีล ${deal.next_follow_up}`,
          href: "/sales?view=today",
          action: "ติดตามดีล",
          tone: "blue",
        });
      }
    }
    for (const prospect of (prospectsRes.data ?? []) as SalesProspect[]) {
      if (
        prospect.next_follow_up &&
        prospect.next_follow_up <= today &&
        prospect.status !== "converted" &&
        prospect.status !== "not_interested"
      ) {
        next.push({
          id: `p-${prospect.id}`,
          title: prospect.name,
          detail: `นัดติดตามเป้าหมาย ${prospect.next_follow_up}`,
          href: `/sales?view=prospects&open=${prospect.id}`,
          action: "โทร/บันทึก",
          tone: "violet",
        });
      }
    }
    for (const invoice of (invoicesRes.data ?? []) as Invoice[]) {
      if (invoice.due_date && invoice.due_date <= soon) {
        next.push({
          id: `inv-${invoice.id}`,
          title: invoice.title,
          detail: `ใบแจ้งหนี้ครบ ${invoice.due_date}`,
          href: "/invoices",
          action: "ออก/ตามเงิน",
          tone: invoice.status === "overdue" ? "red" : "amber",
        });
      }
    }
    for (const notif of (notifRes.data ?? []) as AppNotification[]) {
      next.push({
        id: `n-${notif.id}`,
        title: notif.title,
        detail: notif.body ?? "ต้องตอบหรือจัดการ",
        href: notif.link ?? "/notifications",
        action: "จัดการ",
        tone: "slate",
      });
    }

    const channelList = (channelsRes.data ?? []) as Channel[];
    const team = (profilesRes.data ?? []) as Profile[];
    const unread = await fetchUnreadCounts(
      supabase,
      user.id,
      channelList.map((ch) => ch.id)
    );
    for (const ch of channelList) {
      const count = unread[ch.id] ?? 0;
      if (!count) continue;
      next.push({
        id: `chat-${ch.id}`,
        title: channelTitle(ch, team, user.id),
        detail: `${count} ข้อความยังไม่อ่าน`,
        href: chatChannelHref(ch.id),
        action: "อ่านแชท",
        tone: "blue",
      });
    }

    const urgency = { red: 0, amber: 1, violet: 2, blue: 3, slate: 4 } as const;
    next.sort((a, b) => urgency[a.tone] - urgency[b.tone]);

    setItems(next);
    setLoading(false);
    if (tasksRes.error && dealsRes.error) setError("โหลดวันนี้ไม่สำเร็จ");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (loading) return <PageLoader label="กำลังจัดคิววันนี้..." />;
  if (error) {
    return (
      <PageShell>
        <ErrorState description={error} onRetry={() => { setLoading(true); void load(); }} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="วันนี้ต้องทำอะไร"
        description="งานใกล้ครบ นัดขาย ใบแจ้งหนี้ และข้อความที่ต้องตอบ รวมไว้หน้าเดียว"
      />
      <Card>
        <CardHeader
          title="คิววันนี้"
          description={`${items.length} รายการ`}
          icon={<CalendarClock size={18} className="text-accent" />}
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={28} />}
            title="วันนี้โล่ง"
            description="ยังไม่มีงานหรือนัดที่ต้องรีบทำ"
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusStamp label={item.action} tone={item.tone} />
                  <Link href={item.href}>
                    <Button>ทำต่อ</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/tasks"><CheckSquare size={18} /> งาน</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/sales?view=today"><CalendarClock size={18} /> แผนกขาย</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/invoices"><Receipt size={18} /> เอกสาร</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/notifications"><Bell size={18} /> กล่องงาน</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/chat"><MessageCircle size={18} /> แชท</Link>
      </div>
    </PageShell>
  );
}
