"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  ExternalLink,
  FileText,
  History,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { StatusBadge, Avatar } from "@/components/ui";
import { CLIENT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/constants";
import { buildClientTimeline } from "@/lib/client-timeline";
import type { ClientTimelineItem } from "@/lib/extras-types";
import type { Client, Task } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const TIMELINE_ICONS = {
  activity: History,
  task: CheckSquare,
  invoice: FileText,
  file: FileText,
  portal: Users,
};

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeline, setTimeline] = useState<ClientTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) load();
  }, [clientId]);

  async function load() {
    const supabase = createClient();
    const [clientRes, tasksRes, actRes, invRes, filesRes, portalRes] =
      await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single(),
        supabase
          .from("tasks")
          .select("*, assignee:profiles!tasks_assigned_to_fkey(*)")
          .eq("client_id", clientId)
          .is("parent_id", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("activity_logs")
          .select("*, user:profiles(*)")
          .eq("entity_id", clientId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("invoices")
          .select("*")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("client_files")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("portal_comments")
          .select("author_name, content, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (!clientRes.data) {
      setLoading(false);
      return;
    }

    setClient(clientRes.data);
    setTasks((tasksRes.data ?? []) as Task[]);

    const taskActivities = await supabase
      .from("activity_logs")
      .select("*, user:profiles(*)")
      .eq("entity_type", "task")
      .in(
        "entity_id",
        (tasksRes.data ?? []).map((t) => t.id)
      )
      .order("created_at", { ascending: false })
      .limit(30);

    const allActivities = [
      ...(actRes.data ?? []),
      ...(taskActivities.data ?? []),
    ];

    setTimeline(
      buildClientTimeline({
        activities: allActivities,
        tasks: (tasksRes.data ?? []) as Task[],
        invoices: invRes.data ?? [],
        files: filesRes.data ?? [],
        portalComments: portalRes.error ? [] : portalRes.data ?? [],
      })
    );
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">ไม่พบลูกค้า</p>
        <Link href="/clients" className="text-accent text-sm mt-2 inline-block">
          กลับรายการลูกค้า
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto lg:max-w-3xl">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent"
      >
        <ArrowLeft size={14} /> ลูกค้าทั้งหมด
      </Link>

      <PageHeader
        title={client.name}
        description={
          [client.company, PROJECT_TYPE_LABELS[client.project_type]]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-lg font-bold text-accent">{tasks.length}</p>
          <p className="text-[11px] text-muted">งาน</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-lg font-bold text-emerald-300">
            {tasks.filter((t) => t.status === "done").length}
          </p>
          <p className="text-[11px] text-muted">เสร็จแล้ว</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center col-span-2">
          <p className="text-sm font-medium">{CLIENT_STATUS_LABELS[client.status]}</p>
          <p className="text-[11px] text-muted">สถานะลูกค้า</p>
        </div>
      </div>

      {client.description && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm text-muted">{client.description}</p>
        </div>
      )}

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">งานของลูกค้า</h2>
          <Link href={`/tasks?client=${client.id}`} className="text-xs text-accent">
            ดูทั้งหมด
          </Link>
        </div>
        <div className="divide-y divide-border">
          {tasks.slice(0, 6).map((task) => (
            <Link
              key={task.id}
              href="/tasks"
              className="flex items-center justify-between px-4 py-3 hover:bg-card-hover"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                <p className="text-xs text-muted">
                  {task.assignee?.display_name ?? "ยังไม่มอบหมาย"} · {task.progress}%
                </p>
              </div>
              <StatusBadge status={task.status} />
            </Link>
          ))}
          {tasks.length === 0 && (
            <p className="text-sm text-muted text-center py-6">ยังไม่มีงาน</p>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <History size={16} className="text-accent" />
            Timeline
          </h2>
        </div>
        <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
          {timeline.map((item) => {
            const Icon = TIMELINE_ICONS[item.type];
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={14} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted truncate">{item.subtitle}</p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">
                    {format(new Date(item.date), "d MMM yyyy HH:mm", { locale: th })}
                  </p>
                </div>
                {item.link && (
                  <Link href={item.link} className="text-accent shrink-0">
                    <ExternalLink size={14} />
                  </Link>
                )}
              </div>
            );
          })}
          {timeline.length === 0 && (
            <p className="text-sm text-muted text-center py-6">ยังไม่มีประวัติ</p>
          )}
        </div>
      </section>
    </div>
  );
}
