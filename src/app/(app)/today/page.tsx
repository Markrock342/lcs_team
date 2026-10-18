"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CalendarClock, CheckSquare, Code2, MessageCircle } from "lucide-react";
import { neonRequest } from "@/lib/neon/client";
import { Button, Card, CardHeader, EmptyState, ErrorState, PageLoader, StatusStamp } from "@/components/ui";
import { PageHeader, PageShell } from "@/components/mobile-ui";

type DayItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "blue" | "amber" | "red" | "violet" | "slate";
};

export default function TodayPage() {
  const [items, setItems] = useState<DayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const data = await neonRequest<{ items: DayItem[] }>("/api/neon/today", { cache: "no-store" });
      setItems(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดวันนี้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/tasks"><CheckSquare size={18} /> งาน</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/code"><Code2 size={18} /> โค้ด</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/assistant"><Bot size={18} /> AI</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/chat"><MessageCircle size={18} /> แชท</Link>
        <Link className="job-jacket flex min-h-16 items-center gap-2 p-4" href="/sales?view=today"><CalendarClock size={18} /> แผนกขาย</Link>
      </div>
    </PageShell>
  );
}
