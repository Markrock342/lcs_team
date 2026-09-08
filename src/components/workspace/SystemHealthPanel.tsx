"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleAlert } from "lucide-react";
import { Button, Card, CardHeader, ErrorState, PageLoader } from "@/components/ui";

type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
};

export function SystemHealthPanel() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/health");
      const payload = (await response.json()) as { checks?: Check[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "ตรวจระบบไม่สำเร็จ");
      setChecks(payload.checks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  if (loading) return <PageLoader label="กำลังตรวจสุขภาพระบบ..." />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const failed = checks.filter((item) => !item.ok).length;

  return (
    <Card>
      <CardHeader
        title="สุขภาพระบบ"
        description={failed ? `ต้องแก้ ${failed} จุด` : "พร้อมใช้งาน"}
        icon={<Activity size={18} className="text-accent" />}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            ตรวจอีกครั้ง
          </Button>
        }
      />
      <ul className="divide-y divide-border">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-3 px-4 py-3">
            {check.ok ? (
              <CheckCircle2 size={18} className="mt-0.5 text-(--status-green-fg)" />
            ) : (
              <CircleAlert size={18} className="mt-0.5 text-(--status-amber-fg)" />
            )}
            <div>
              <p className="font-medium">{check.label}</p>
              <p className="text-sm text-muted">{check.detail}</p>
              {!check.ok && check.fix && (
                <p className="mt-1 text-sm">วิธีแก้: {check.fix}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
