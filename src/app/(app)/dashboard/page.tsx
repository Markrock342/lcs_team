"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CheckSquare,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge, Avatar, ProfileRoleBadges } from "@/components/ui";
import { TaskCountdown } from "@/components/TaskCountdown";
import { QuickActionGrid } from "@/components/mobile-ui";
import { TEAM } from "@/lib/constants";
import { CLIENT_STATUS_LABELS } from "@/lib/constants";
import type { Task, Client, Profile } from "@/lib/types";

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();

    const [tasksRes, clientsRes, profilesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, client:clients(*), assignee:profiles!tasks_assigned_to_fkey(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
    ]);

    setTasks(tasksRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  const pending = tasks.filter((t) => t.status === "pending");
  const waiting = tasks.filter((t) => t.status === "waiting");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const activeClients = clients.filter((c) => c.status === "active");
  const openTasks = tasks.filter((t) => t.status !== "done");

  const stats = [
    {
      label: "ลูกค้าที่ทำอยู่",
      value: activeClients.length,
      href: "/clients",
      icon: Users,
      card: "bg-gradient-to-br from-[#00a3ff]/20 via-[#00a3ff]/8 to-transparent border-[#00a3ff]/35",
      iconBg: "bg-[#00a3ff]/25",
      iconColor: "text-[#7dd3ff]",
      valueColor: "text-[#7dd3ff]",
    },
    {
      label: "งานกำลังทำ",
      value: inProgress.length,
      href: "/tasks?status=in_progress",
      icon: TrendingUp,
      card: "bg-gradient-to-br from-emerald-500/20 via-emerald-500/8 to-transparent border-emerald-500/35",
      iconBg: "bg-emerald-500/25",
      iconColor: "text-emerald-300",
      valueColor: "text-emerald-300",
    },
    {
      label: "รอดำเนินการ",
      value: waiting.length,
      href: "/tasks?status=waiting",
      icon: Clock,
      card: "bg-gradient-to-br from-amber-500/20 via-amber-500/8 to-transparent border-amber-500/35",
      iconBg: "bg-amber-500/25",
      iconColor: "text-amber-300",
      valueColor: "text-amber-300",
    },
    {
      label: "ยังไม่เริ่ม",
      value: pending.length,
      href: "/tasks?status=pending",
      icon: AlertTriangle,
      card: "bg-gradient-to-br from-rose-500/20 via-rose-500/8 to-transparent border-rose-500/35",
      iconBg: "bg-rose-500/25",
      iconColor: "text-rose-300",
      valueColor: "text-rose-300",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto lg:max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">สวัสดี, ทีม {TEAM.shortName} 👋</h1>
        <p className="text-muted mt-1 text-sm">กดทำสิ่งที่ต้องการได้เลย</p>
      </div>

      <QuickActionGrid
        actions={[
          {
            href: "/tasks",
            label: "ดูงาน",
            icon: <CheckSquare size={26} className="text-accent" />,
            className: "border-accent/40 bg-accent/10 hover:bg-accent/15",
          },
          {
            href: "/finance?income=1",
            label: "รับเงิน",
            icon: <ArrowDownLeft size={26} className="text-emerald-300" />,
            className: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15",
          },
          {
            href: "/finance?pay=1",
            label: "จ่ายเพื่อน",
            icon: <ArrowUpRight size={26} className="text-rose-300" />,
            className: "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15",
          },
          {
            href: "/clients",
            label: "ลูกค้า",
            icon: <Users size={26} className="text-[#7dd3ff]" />,
            className: "border-[#00a3ff]/35 bg-[#00a3ff]/10 hover:bg-[#00a3ff]/15",
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`border rounded-2xl p-4 transition-all active:scale-[0.98] touch-manipulation ${s.card}`}
          >
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}>
              <s.icon className={s.iconColor} size={20} />
            </div>
            <p className={`text-2xl font-bold ${s.valueColor}`}>{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      <section className="bg-card border border-[#00a3ff]/25 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#00a3ff]/15 bg-[#00a3ff]/5">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <CheckSquare size={16} className="text-accent" />
            งานที่ต้องทำ
          </h2>
          <Link href="/tasks" className="text-xs text-accent flex items-center gap-1 touch-manipulation">
            ดูทั้งหมด <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {openTasks.slice(0, 5).map((task) => (
            <Link
              key={task.id}
              href="/tasks"
              className="block px-4 py-3 hover:bg-card-hover active:bg-card-hover transition-colors touch-manipulation"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{task.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {task.client?.name ?? "ไม่ระบุลูกค้า"}
                  </p>
                  <div className="mt-1.5">
                    <TaskCountdown
                      startDate={task.start_date}
                      dueDate={task.due_date}
                      status={task.status}
                      size="sm"
                    />
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            </Link>
          ))}
          {openTasks.length === 0 && (
            <div className="px-4 py-8 text-center space-y-3">
              <p className="text-sm text-muted">ไม่มีงานค้าง 🎉</p>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-sm text-accent touch-manipulation"
              >
                <Plus size={14} /> เพิ่มงานใหม่
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-card border border-violet-500/25 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-violet-500/15 bg-violet-500/5">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users size={16} className="text-violet-400" />
              ทีมงาน
            </h2>
          </div>
          <div className="p-3 space-y-2">
            {(profiles.length > 0
              ? profiles
              : TEAM.members.map((m, i) => ({
                  id: String(i),
                  username: m.username,
                  display_name: m.displayName,
                  role: m.role,
                  display_roles: null,
                  avatar_url: null,
                  created_at: "",
                }))
            ).map((member) => {
              const memberTasks = tasks.filter(
                (t) => t.assigned_to === member.id && t.status !== "done"
              );
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-background border border-border"
                >
                  <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{member.display_name}</p>
                      <ProfileRoleBadges profile={member} size="xs" />
                    </div>
                    <p className="text-xs text-muted">{memberTasks.length} งานค้าง</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-card border border-emerald-500/25 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/15 bg-emerald-500/5">
            <h2 className="font-semibold text-sm">ลูกค้าล่าสุด</h2>
            <Link href="/clients" className="text-xs text-accent flex items-center gap-1">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {clients.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                href="/clients"
                className="flex items-center justify-between px-4 py-3 hover:bg-card-hover active:bg-card-hover touch-manipulation"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.contact_name && (
                    <p className="text-xs text-muted truncate">{c.contact_name}</p>
                  )}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0 ml-2">
                  {CLIENT_STATUS_LABELS[c.status]}
                </span>
              </Link>
            ))}
            {clients.length === 0 && (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm text-muted">ยังไม่มีลูกค้า</p>
                <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-accent">
                  <Plus size={14} /> เพิ่มลูกค้า
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      <Link
        href="/schedule"
        className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card hover:border-accent/30 active:bg-card-hover touch-manipulation"
      >
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-accent" />
          <div>
            <p className="font-medium text-sm">ตารางงาน</p>
            <p className="text-xs text-muted">ดูปฏิทินและ deadline</p>
          </div>
        </div>
        <ArrowRight size={16} className="text-muted" />
      </Link>
    </div>
  );
}
