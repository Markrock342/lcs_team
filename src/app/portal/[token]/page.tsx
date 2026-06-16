"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { INVOICE_STATUS_LABELS } from "@/lib/extras-types";
import { PROJECT_TYPE_LABELS } from "@/lib/constants";
import type { ProjectType } from "@/lib/types";

interface PortalData {
  client: {
    name: string;
    company: string | null;
    project_type: ProjectType;
    status: string;
    description: string | null;
  };
  tasks: { title: string; status: string; progress: number; start_date: string | null; due_date: string | null; duration_days: number }[];
  invoices: { title: string; total_amount: number; status: string; due_date: string | null }[];
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setToken(p.token);
      fetch(`/api/portal/${p.token}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(setData)
        .catch(() => setError("ลิงก์ไม่ถูกต้องหรือถูกปิดใช้งาน"))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <Logo size="lg" />
        <p className="text-muted mt-6">{error || "ไม่พบข้อมูล"}</p>
      </div>
    );
  }

  const { client, tasks, invoices } = data;
  const avgProgress = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-6 text-center">
        <Logo size="md" />
        <h1 className="text-xl font-bold mt-4">{client.name}</h1>
        {client.company && <p className="text-muted text-sm">{client.company}</p>}
        <p className="text-accent text-sm mt-1">{PROJECT_TYPE_LABELS[client.project_type]}</p>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="bg-card border border-border rounded-2xl p-5 text-center">
          <p className="text-3xl font-bold text-accent">{avgProgress}%</p>
          <p className="text-sm text-muted">ความคืบหน้าโปรเจกต์</p>
          <div className="h-2 bg-background rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${avgProgress}%` }} />
          </div>
        </div>

        {client.description && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h2 className="font-semibold text-sm mb-2">รายละเอียด</h2>
            <p className="text-sm text-muted">{client.description}</p>
          </div>
        )}

        <section>
          <h2 className="font-semibold mb-3">งาน</h2>
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-3">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-medium text-sm">{t.title}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
                    {TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS] ?? t.status}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-muted mt-1">
                  {t.start_date && <span>เริ่ม {t.start_date}</span>}
                  {t.due_date && <span>ครบ {t.due_date}</span>}
                </div>
                <div className="h-1 bg-background rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${t.progress}%` }} />
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-muted text-sm text-center py-4">ยังไม่มีงาน</p>}
          </div>
        </section>

        {invoices.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">ใบแจ้งหนี้</h2>
            <div className="space-y-2">
              {invoices.map((inv, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3 flex justify-between">
                  <div>
                    <p className="font-medium text-sm">{inv.title}</p>
                    <p className="text-xs text-muted">฿{inv.total_amount.toLocaleString()}</p>
                  </div>
                  <span className="text-xs text-accent">
                    {INVOICE_STATUS_LABELS[inv.status as keyof typeof INVOICE_STATUS_LABELS]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-[10px] text-muted pb-8">Powered by Limit Code Studio</p>
      </main>
    </div>
  );
}
