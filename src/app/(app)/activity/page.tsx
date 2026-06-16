"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/mobile-ui";
import { ACTIVITY_ACTION_LABELS, type ActivityLog } from "@/lib/extras-types";
import { Avatar } from "@/components/ui";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("activity_logs")
      .select("*, user:profiles(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="ประวัติกิจกรรม" description="Log การเปลี่ยนแปลงทั้งหมดในทีม" />

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 p-3 bg-card border border-border rounded-xl">
            {log.user && <Avatar name={log.user.display_name} size="sm" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{log.user?.display_name ?? "ระบบ"}</span>{" "}
                <span className="text-accent">{ACTIVITY_ACTION_LABELS[log.action] ?? log.action}</span>{" "}
                <span className="text-muted">{log.entity_type}</span>{" "}
                <span className="font-medium">{log.entity_title}</span>
              </p>
              <p className="text-[10px] text-muted mt-0.5">
                {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: th })}
              </p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-center text-muted py-12">
            ยังไม่มีประวัติ — รัน supabase/add-all-features.sql ก่อน
          </p>
        )}
      </div>
    </div>
  );
}
