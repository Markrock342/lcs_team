"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { Avatar } from "@/components/ui";
import {
  aggregateByClient,
  aggregateByUser,
  filterEntriesByPeriod,
  formatMinutes,
} from "@/lib/time-reports";
import { exportToCSV } from "@/lib/activity";
import type { TimeEntry } from "@/lib/extras-types";
import type { Profile } from "@/lib/types";
import { Download } from "lucide-react";

export default function TimeReportsPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<
    Array<{ id: string; client_id: string | null; title: string; client?: { name: string } | null }>
  >([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const [entriesRes, tasksRes, profilesRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*, user:profiles(*)")
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, client_id, title, client:clients(name)"),
      supabase.from("profiles").select("*"),
    ]);

    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setTasks(
      (tasksRes.data ?? []).map((t) => {
        const row = t as {
          id: string;
          client_id: string | null;
          title: string;
          client?: { name: string } | { name: string }[] | null;
        };
        return {
          id: row.id,
          client_id: row.client_id,
          title: row.title,
          client: Array.isArray(row.client) ? row.client[0] : row.client ?? null,
        };
      })
    );
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  const filtered = filterEntriesByPeriod(entries, period);
  const byUser = aggregateByUser(filtered, profiles);
  const byClient = aggregateByClient(filtered, tasks);
  const totalMinutes = filtered.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

  function exportCsv() {
    exportToCSV(
      "time-report.csv",
      ["สมาชิก", "นาที", "ชั่วโมง"],
      byUser.map((r) => [
        r.userName,
        String(r.totalMinutes),
        (r.totalMinutes / 60).toFixed(1),
      ])
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-lg mx-auto lg:max-w-3xl">
      <PageHeader
        title="รายงานเวลาทำงาน"
        description="สรุปชั่วโมงจาก Time Tracker ต่อคนและลูกค้า"
      />

      <div className="flex gap-2 flex-wrap">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 rounded-xl bg-card border border-border text-sm"
        >
          <option value="month">เดือนนี้</option>
          <option value="year">ปีนี้</option>
          <option value="all">ทั้งหมด</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm hover:border-accent/30"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 text-center">
        <p className="text-3xl font-bold text-accent">{formatMinutes(totalMinutes)}</p>
        <p className="text-sm text-muted">รวมช่วงที่เลือก</p>
      </div>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">ต่อสมาชิก</h2>
        </div>
        <div className="divide-y divide-border">
          {byUser.map((row) => (
            <div key={row.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={row.userName} size="sm" />
              <div className="flex-1">
                <p className="text-sm font-medium">{row.userName}</p>
                <p className="text-xs text-muted">{row.entryCount} รอบ</p>
              </div>
              <p className="font-bold text-accent">{formatMinutes(row.totalMinutes)}</p>
            </div>
          ))}
          {byUser.length === 0 && (
            <p className="text-sm text-muted text-center py-6">ยังไม่มีข้อมูลเวลา</p>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">ต่อลูกค้า</h2>
        </div>
        <div className="divide-y divide-border">
          {byClient.map((row) => (
            <div key={row.clientId} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium">{row.clientName}</p>
              <p className="font-bold text-emerald-300">{formatMinutes(row.totalMinutes)}</p>
            </div>
          ))}
          {byClient.length === 0 && (
            <p className="text-sm text-muted text-center py-6">ยังไม่มีข้อมูล</p>
          )}
        </div>
      </section>
    </div>
  );
}
