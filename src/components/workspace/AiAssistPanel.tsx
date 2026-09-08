"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { prospectContext, type AssistMode } from "@/lib/sales-playbook";
import type { SalesProspect } from "@/lib/types";

const ACTIONS: { mode: AssistMode; label: string }[] = [
  { mode: "email", label: "ร่างอีเมล" },
  { mode: "call", label: "สคริปต์โทร" },
  { mode: "summary", label: "สรุปการคุย" },
  { mode: "next_action", label: "แนะนำงานถัดไป" },
];

export function AiAssistPanel({
  prospect,
  extra,
  onUse,
}: {
  prospect: SalesProspect;
  extra?: string;
  onUse: (text: string, mode: AssistMode) => void;
}) {
  const [loading, setLoading] = useState<AssistMode | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<AssistMode>("email");
  const [error, setError] = useState("");

  async function run(nextMode: AssistMode) {
    setLoading(nextMode);
    setError("");
    setMode(nextMode);
    try {
      const response = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: nextMode,
          context: prospectContext(prospect),
          extra,
        }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "เรียก AI ไม่สำเร็จ");
      setDraft(payload.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เรียก AI ไม่สำเร็จ");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-surface-soft p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Sparkles size={16} className="text-accent" />
        ผู้ช่วยร่างข้อความ
      </div>
      <p className="text-sm text-muted">
        AI ร่างให้เท่านั้น ต้องตรวจก่อน แล้วค่อยส่งจากเมลทีมเอง ระบบไม่ยิงแทน
      </p>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action.mode}
            type="button"
            variant={mode === action.mode ? "primary" : "secondary"}
            loading={loading === action.mode}
            onClick={() => void run(action.mode)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-(--status-red-fg)">{error}</p>}
      {draft && (
        <>
          <Textarea
            label="ร่างจาก AI — แก้ได้ก่อนใช้"
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" onClick={() => onUse(draft, mode)}>
              ใช้ร่างนี้
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(draft)}
            >
              คัดลอก
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
