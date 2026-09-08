"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { ACTIVITY_ACTION_LABELS, type ActivityLog } from "@/lib/extras-types";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  PageLoader,
  StatusStamp,
} from "@/components/ui";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Activity, History } from "lucide-react";

const ENTITY_LABELS: Record<string, string> = {
  task: "งาน",
  client: "ลูกค้า",
  invoice: "เอกสาร",
  task_template: "เทมเพลต",
  profile: "สมาชิก",
  transaction: "รายการเงิน",
};

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("activity_logs")
      .select("*, user:profiles(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (loadError) {
      setError("โหลดประวัติกิจกรรมไม่สำเร็จ ลองอีกครั้ง");
      setLoading(false);
      return;
    }
    setLogs(data ?? []);
    setLoading(false);
  }

  if (loading) {
    return <PageLoader label="กำลังโหลดประวัติกิจกรรม..." />;
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
        title="ประวัติกิจกรรม"
        description="รายการเปลี่ยนแปลงล่าสุดของทีม"
      />

      <Card>
        <CardHeader
          title="กิจกรรมล่าสุด"
          description={`แสดงสูงสุด 100 รายการ · พบ ${logs.length} รายการ`}
          icon={<History size={18} className="text-accent" />}
        />
        {logs.length > 0 ? (
          <div className="divide-y divide-border">
        {logs.map((log) => (
          <ListRow
            key={log.id}
            leading={
              log.user ? (
                <Avatar name={log.user.display_name} src={log.user.avatar_url} size="sm" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted">
                  <Activity size={15} />
                </span>
              )
            }
            title={
              <span className="block text-sm">
                {log.user?.display_name ?? "ระบบ"}{" "}
                <span className="font-normal text-muted">
                  {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                </span>{" "}
                {log.entity_title}
              </span>
            }
            description={
              <time dateTime={log.created_at}>
                {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: th })}
              </time>
            }
            trailing={
              <StatusStamp label={ACTIVITY_ACTION_LABELS[log.action] ?? log.action} />
            }
          />
        ))}
          </div>
        ) : (
          <EmptyState
            icon={<History size={28} />}
            title="ยังไม่มีกิจกรรม"
            description="เมื่อทีมเริ่มแก้ไขงานหรือข้อมูล กิจกรรมจะแสดงที่นี่"
          />
        )}
      </Card>
    </PageShell>
  );
}
