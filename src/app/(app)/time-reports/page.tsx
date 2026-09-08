"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  MetricTile,
  PageLoader,
} from "@/components/ui";
import {
  aggregateByClient,
  aggregateByUser,
  filterEntriesByPeriod,
  formatMinutes,
} from "@/lib/time-reports";
import { exportToCSV } from "@/lib/activity";
import type { TimeEntry } from "@/lib/extras-types";
import type { Profile } from "@/lib/types";
import { Clock3, Download, Users } from "lucide-react";

export default function TimeReportsPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<
    Array<{ id: string; client_id: string | null; title: string; client?: { name: string } | null }>
  >([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
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
    if (entriesRes.error || tasksRes.error || profilesRes.error) {
      setError("โหลดรายงานเวลาไม่สำเร็จ โปรดลองอีกครั้ง");
      setLoading(false);
      return;
    }

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
    return <PageLoader label="กำลังสรุปเวลาทำงาน..." />;
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

  return (
    <PageShell width="medium">
      <PageHeader
        title="รายงานเวลาทำงาน"
        description="สรุปเวลาที่บันทึก แยกตามสมาชิกและลูกค้า"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>ช่วงเวลา</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="month">เดือนนี้</option>
            <option value="year">ปีนี้</option>
            <option value="all">ทั้งหมด</option>
          </select>
        </label>
        <button
          type="button"
          onClick={exportCsv}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-card-hover"
        >
          <Download size={16} /> ส่งออก CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="เวลารวม"
          value={formatMinutes(totalMinutes)}
          icon={<Clock3 size={18} />}
        />
        <MetricTile
          label="รายการเวลา"
          value={filtered.length}
          icon={<Clock3 size={18} />}
        />
        <MetricTile
          label="สมาชิกที่มีรายการ"
          value={byUser.length}
          icon={<Users size={18} />}
        />
      </div>

      <Card>
        <CardHeader
          title="แยกตามสมาชิก"
          description={`${byUser.length} คนในช่วงที่เลือก`}
          icon={<Users size={18} className="text-accent" />}
        />
        {byUser.length > 0 ? (
          <div className="divide-y divide-border">
          {byUser.map((row) => (
            <ListRow
              key={row.userId}
              leading={<Avatar name={row.userName} size="sm" />}
              title={row.userName}
              description={`${row.entryCount} รายการ`}
              trailing={
                <span className="font-semibold tabular-nums">
                  {formatMinutes(row.totalMinutes)}
                </span>
              }
            />
          ))}
          </div>
        ) : (
          <EmptyState
            icon={<Clock3 size={28} />}
            title="ยังไม่มีเวลาของสมาชิก"
            description="ไม่พบรายการเวลาที่เสร็จแล้วในช่วงนี้"
          />
        )}
      </Card>

      <Card>
        <CardHeader
          title="แยกตามลูกค้า"
          description={`${byClient.length} ลูกค้าในช่วงที่เลือก`}
        />
        {byClient.length > 0 ? (
          <div className="divide-y divide-border">
          {byClient.map((row) => (
            <ListRow
              key={row.clientId}
              title={row.clientName}
              trailing={
                <span className="font-semibold tabular-nums">
                  {formatMinutes(row.totalMinutes)}
                </span>
              }
            />
          ))}
          </div>
        ) : (
          <EmptyState
            icon={<Users size={28} />}
            title="ยังไม่มีเวลาของลูกค้า"
            description="ไม่พบเวลาที่เชื่อมกับลูกค้าในช่วงนี้"
          />
        )}
      </Card>
    </PageShell>
  );
}
