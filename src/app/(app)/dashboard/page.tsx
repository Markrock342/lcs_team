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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge, Avatar } from "@/components/ui";
import { TEAM } from "@/lib/constants";
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

  const stats = [
    {
      label: "ลูกค้าที่ทำอยู่",
      value: activeClients.length,
      icon: Users,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "งานกำลังทำ",
      value: inProgress.length,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "รอดำเนินการ",
      value: waiting.length,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "ยังไม่เริ่ม",
      value: pending.length,
      icon: AlertTriangle,
      color: "text-zinc-400",
      bg: "bg-zinc-500/10",
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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">สวัสดี, ทีม {TEAM.shortName} 👋</h1>
        <p className="text-muted mt-1">ภาพรวมงานและลูกค้าทั้งหมด</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border rounded-2xl p-4 hover:border-accent/30 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={s.color} size={20} />
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending tasks */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckSquare size={18} className="text-accent" />
              งานที่ต้องทำ
            </h2>
            <Link
              href="/tasks"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {tasks
              .filter((t) => t.status !== "done")
              .slice(0, 6)
              .map((task) => (
                <div key={task.id} className="px-5 py-3 hover:bg-card-hover transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {task.client?.name ?? "ไม่ระบุลูกค้า"} · {task.duration_days} วัน
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                </div>
              ))}
            {tasks.filter((t) => t.status !== "done").length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted">ไม่มีงานค้าง 🎉</p>
            )}
          </div>
        </section>

        {/* Team */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <Users size={18} className="text-accent" />
              ทีมงาน
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {(profiles.length > 0 ? profiles : TEAM.members.map((m, i) => ({
              id: String(i),
              username: m.username,
              display_name: m.displayName,
              role: m.role,
              avatar_url: null,
              created_at: "",
            }))).map((member) => {
              const memberTasks = tasks.filter(
                (t) => t.assigned_to === member.id && t.status !== "done"
              );
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border"
                >
                  <Avatar name={member.display_name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{member.display_name}</p>
                    <p className="text-xs text-muted">
                      {memberTasks.length} งานที่รับผิดชอบ
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Recent clients */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">ลูกค้าล่าสุด</h2>
          <Link href="/clients" className="text-xs text-accent hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                <th className="text-left px-5 py-3 font-medium">ชื่อ</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">ติดต่อ</th>
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell">ประเภท</th>
                <th className="text-left px-5 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.slice(0, 5).map((c) => (
                <tr key={c.id} className="hover:bg-card-hover transition-colors">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-muted hidden sm:table-cell">
                    {c.contact_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-muted hidden md:table-cell">
                    {c.project_type}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted">
                    ยังไม่มีลูกค้า — เพิ่มลูกค้าใหม่ได้ที่หน้าลูกค้า
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
