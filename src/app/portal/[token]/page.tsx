"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { INVOICE_STATUS_LABELS } from "@/lib/extras-types";
import { PROJECT_TYPE_LABELS } from "@/lib/constants";
import type { PortalComment, PortalTaskFeedback } from "@/lib/extras-types";
import type { ProjectType } from "@/lib/types";
import { ExternalLink, MessageCircle, ThumbsUp, ThumbsDown } from "lucide-react";

interface PortalTask {
  id: string;
  title: string;
  status: string;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  duration_days: number;
}

interface PortalData {
  client: {
    id?: string;
    name: string;
    company: string | null;
    project_type: ProjectType;
    status: string;
    description: string | null;
  };
  tasks: PortalTask[];
  invoices: { title: string; total_amount: number; status: string; due_date: string | null }[];
  files?: { name: string; file_url: string; file_type: string | null; created_at: string }[];
  comments?: PortalComment[];
  feedback?: PortalTaskFeedback[];
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [feedbackTask, setFeedbackTask] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  async function loadPortal(t: string) {
    const res = await fetch(`/api/portal/${t}`);
    if (!res.ok) throw new Error("invalid");
    return res.json() as Promise<PortalData>;
  }

  useEffect(() => {
    params.then((p) => {
      setToken(p.token);
      loadPortal(p.token)
        .then(setData)
        .catch(() => setError("ลิงก์ไม่ถูกต้องหรือถูกปิดใช้งาน"))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!authorName.trim() || !comment.trim()) return;
    setSending(true);
    const res = await fetch(`/api/portal/${token}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_name: authorName, content: comment }),
    });
    setSending(false);
    if (res.ok) {
      setComment("");
      const refreshed = await loadPortal(token);
      setData(refreshed);
    }
  }

  async function submitFeedback(taskId: string, status: "approved" | "changes_requested") {
    if (!authorName.trim()) return;
    setSending(true);
    const res = await fetch(`/api/portal/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author_name: authorName,
        task_id: taskId,
        status,
        comment: feedbackComment || null,
      }),
    });
    setSending(false);
    if (res.ok) {
      setFeedbackTask(null);
      setFeedbackComment("");
      const refreshed = await loadPortal(token);
      setData(refreshed);
    }
  }

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

  const { client, tasks, invoices, files = [], comments = [], feedback = [] } = data;
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
            {tasks.map((t) => {
              const taskFeedback = feedback.filter((f) => f.task_id === t.id);
              return (
                <div key={t.id} className="bg-card border border-border rounded-xl p-3">
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
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={sending || !authorName.trim()}
                      onClick={() => submitFeedback(t.id, "approved")}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs disabled:opacity-40"
                    >
                      <ThumbsUp size={12} /> อนุมัติ
                    </button>
                    <button
                      type="button"
                      disabled={sending || !authorName.trim()}
                      onClick={() => setFeedbackTask(feedbackTask === t.id ? null : t.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 text-xs disabled:opacity-40"
                    >
                      <ThumbsDown size={12} /> ขอแก้ไข
                    </button>
                  </div>
                  {feedbackTask === t.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="ระบุสิ่งที่ต้องการแก้ไข..."
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                        rows={2}
                      />
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => submitFeedback(t.id, "changes_requested")}
                        className="text-xs text-accent"
                      >
                        ส่งคำขอแก้ไข
                      </button>
                    </div>
                  )}
                  {taskFeedback.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted">
                      {taskFeedback[0].status === "approved" ? "✓ อนุมัติแล้ว" : "↻ ขอแก้ไข"}
                    </div>
                  )}
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-muted text-sm text-center py-4">ยังไม่มีงาน</p>}
          </div>
        </section>

        {files.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">ไฟล์ส่งมอบ</h2>
            <div className="space-y-2">
              {files.map((f, i) => (
                <a
                  key={i}
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between bg-card border border-border rounded-xl p-3 text-sm hover:border-accent/30"
                >
                  <span>{f.name}</span>
                  <ExternalLink size={14} className="text-accent" />
                </a>
              ))}
            </div>
          </section>
        )}

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

        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <MessageCircle size={16} className="text-accent" />
            แสดงความคิดเห็น
          </h2>
          <form onSubmit={submitComment} className="space-y-3">
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="ชื่อของคุณ"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              required
            />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="พิมพ์ความคิดเห็นหรือคำถาม..."
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              rows={3}
              required
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full py-2.5 rounded-xl bg-accent text-background font-medium text-sm disabled:opacity-50"
            >
              ส่งความคิดเห็น
            </button>
          </form>
          {comments.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              {comments.slice(0, 10).map((c, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-accent">{c.author_name}</span>
                  <p className="text-muted mt-0.5">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-[10px] text-muted pb-8">Powered by Limit Code Studio</p>
      </main>
    </div>
  );
}
