"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckSquare,
  ExternalLink,
  FileText,
  History,
  Mail,
  Phone,
  Users,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import {
  Card,
  CardHeader,
  ClientStatusBadge,
  EmptyState,
  ErrorState,
  ListRow,
  PageLoader,
  StatusBadge,
} from "@/components/ui";
import { PROJECT_TYPE_LABELS } from "@/lib/constants";
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
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
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

      if (clientRes.error && clientRes.error.code !== "PGRST116") {
        setLoadError(clientRes.error.message);
        setLoading(false);
        return;
      }

      if (!clientRes.data) {
        setClient(null);
        setLoading(false);
        return;
      }

      if (tasksRes.error) {
        setLoadError(tasksRes.error.message);
        setLoading(false);
        return;
      }

      setClient(clientRes.data);
      setTasks((tasksRes.data ?? []) as Task[]);

      const taskIds = (tasksRes.data ?? []).map((task) => task.id);
      const taskActivities =
        taskIds.length > 0
          ? await supabase
              .from("activity_logs")
              .select("*, user:profiles(*)")
              .eq("entity_type", "task")
              .in("entity_id", taskIds)
              .order("created_at", { ascending: false })
              .limit(30)
          : { data: [], error: null };

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
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "เกิดข้อผิดพลาดขณะโหลดข้อมูล");
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) void Promise.resolve().then(load);
  }, [clientId, load]);

  if (loading) {
    return <PageLoader label="กำลังโหลดข้อมูลลูกค้า..." />;
  }

  if (loadError) {
    return (
      <PageShell width="medium">
        <Link
          href="/clients"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
        >
          <ArrowLeft size={16} /> ลูกค้าทั้งหมด
        </Link>
        <ErrorState
          description={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError("");
            void load();
          }}
        />
      </PageShell>
    );
  }

  if (!client) {
    return (
      <PageShell width="medium">
        <EmptyState
          icon={<Users size={28} />}
          title="ไม่พบลูกค้า"
          description="ลูกค้ารายนี้อาจถูกลบหรือคุณอาจไม่มีสิทธิ์เข้าถึง"
          action={
            <Link href="/clients" className="text-sm font-semibold text-accent hover:underline">
              กลับรายการลูกค้า
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="medium">
      <Link
        href="/clients"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <ArrowLeft size={16} /> ลูกค้าทั้งหมด
      </Link>

      <PageHeader
        title={client.name}
        description={
          [client.company, PROJECT_TYPE_LABELS[client.project_type]]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={<ClientStatusBadge status={client.status} />}
      />

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-sm text-muted">งานทั้งหมด</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-accent">{tasks.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">เสร็จแล้ว</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-300">
            {tasks.filter((t) => t.status === "done").length}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="ข้อมูลลูกค้า"
          description={PROJECT_TYPE_LABELS[client.project_type]}
          icon={<Users size={18} className="text-accent" />}
        />
        {client.description && (
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm leading-relaxed text-muted">{client.description}</p>
          </div>
        )}
        <div className="divide-y divide-border">
          {client.company && (
            <ListRow
              leading={<Building2 size={18} className="text-muted" />}
              title={client.company}
              description="บริษัท"
            />
          )}
          {client.contact_name && (
            <ListRow
              leading={<UserRound size={18} className="text-muted" />}
              title={client.contact_name}
              description="ผู้ติดต่อ"
            />
          )}
          {client.contact_phone && (
            <ListRow
              leading={<Phone size={18} className="text-muted" />}
              title={
                <a href={`tel:${client.contact_phone}`} className="hover:text-accent">
                  {client.contact_phone}
                </a>
              }
              description="โทรศัพท์"
            />
          )}
          {client.contact_email && (
            <ListRow
              leading={<Mail size={18} className="text-muted" />}
              title={
                <a href={`mailto:${client.contact_email}`} className="break-all hover:text-accent">
                  {client.contact_email}
                </a>
              }
              description="อีเมล"
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="งานของลูกค้า"
          icon={<CheckSquare size={18} className="text-accent" />}
          action={
            <Link href={`/tasks?client=${client.id}`} className="text-sm font-semibold text-accent hover:underline">
              ดูทั้งหมด
            </Link>
          }
        />
        {tasks.length > 0 ? (
          <div className="divide-y divide-border">
            {tasks.slice(0, 6).map((task) => (
              <Link key={task.id} href="/tasks" className="block hover:bg-card-hover">
                <ListRow
                  title={<span className="block truncate">{task.title}</span>}
                  description={`${task.assignee?.display_name ?? "ยังไม่มอบหมาย"} · ${task.progress}%`}
                  trailing={<StatusBadge status={task.status} />}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CheckSquare size={24} />}
            title="ยังไม่มีงาน"
            description="งานที่ผูกกับลูกค้ารายนี้จะแสดงที่นี่"
            action={
              <Link href={`/tasks?client=${client.id}`} className="text-sm font-semibold text-accent hover:underline">
                ไปที่หน้างาน
              </Link>
            }
          />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Timeline"
          description="ประวัติงาน เอกสาร และ Portal"
          icon={<History size={18} className="text-accent" />}
        />
        {timeline.length > 0 ? (
          <div className="max-h-105 divide-y divide-border overflow-y-auto">
            {timeline.map((item) => {
              const Icon = TIMELINE_ICONS[item.type];
              return (
                <ListRow
                  key={item.id}
                  leading={
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft">
                      <Icon size={16} className="text-accent" />
                    </div>
                  }
                  title={<span className="block truncate">{item.title}</span>}
                  description={
                    <>
                      {item.subtitle && <span className="block truncate">{item.subtitle}</span>}
                      <span className="mt-0.5 block text-xs">
                        {format(new Date(item.date), "d MMM yyyy HH:mm", { locale: th })}
                      </span>
                    </>
                  }
                  trailing={
                    item.link ? (
                      <Link
                        href={item.link}
                        aria-label={`เปิด ${item.title}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-accent hover:bg-card-hover"
                      >
                        <ExternalLink size={16} />
                      </Link>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<History size={24} />}
            title="ยังไม่มีประวัติ"
            description="กิจกรรมของลูกค้ารายนี้จะแสดงตามลำดับเวลา"
          />
        )}
      </Card>
    </PageShell>
  );
}
