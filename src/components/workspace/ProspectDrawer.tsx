"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Drawer, Input, Select, StatusStamp, Textarea } from "@/components/ui";
import { AiAssistPanel } from "@/components/workspace/AiAssistPanel";
import {
  INTERACTION_OUTCOME_LABELS,
  INTERACTION_TYPE_LABELS,
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUSES,
} from "@/lib/constants";
import { nextStatusFromOutcome } from "@/lib/sales-playbook";
import { convertProspectToDeal } from "@/lib/workspace-automation";
import { logActivity } from "@/lib/activity";
import type {
  InteractionOutcome,
  InteractionType,
  Profile,
  ProspectStatus,
  SalesInteraction,
  SalesProspect,
} from "@/lib/types";
import type { AssistMode } from "@/lib/sales-playbook";
import { extraText, prospectCategory } from "@/lib/prospect-import";
import { useRole } from "@/components/RoleProvider";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";

function toneFromClass(value: string) {
  return value.replace("status-", "") as "slate" | "blue" | "amber" | "violet" | "green" | "red";
}

export function ProspectDrawer({
  prospect,
  profiles,
  onClose,
  onChanged,
  onDeleted,
}: {
  prospect: SalesProspect | null;
  profiles: Profile[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: (prospect: SalesProspect) => void;
}) {
  const { toast, setSaving, confirm } = useActionFeedback();
  const { canEdit } = useRole();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [province, setProvince] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState<ProspectStatus>("new");
  const [outcome, setOutcome] = useState<InteractionOutcome>("reached");
  const [type, setType] = useState<InteractionType>("call");
  const [log, setLog] = useState("");
  const [fromAi, setFromAi] = useState(false);
  const [history, setHistory] = useState<SalesInteraction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!prospect) return;
    // Sync drawer fields when a different prospect is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(prospect.name ?? "");
    setContactName(prospect.contact_name ?? "");
    setPhone(prospect.contact_phone ?? "");
    setEmail(prospect.contact_email ?? "");
    setProvince(prospect.province ?? "");
    setNotes(prospect.notes ?? "");
    setFollowUp(prospect.next_follow_up ?? "");
    setOwnerId(prospect.owner_id ?? "");
    setStatus(prospect.status);
    setFromAi(false);
    setLog("");
    setHistoryLoading(true);
    const supabase = createClient();
    void supabase
      .from("sales_interactions")
      .select("*, creator:profiles!sales_interactions_created_by_fkey(*)")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setHistory((data as SalesInteraction[]) ?? []);
        setHistoryLoading(false);
      });
  }, [prospect]);

  if (!prospect) return null;
  const current = prospect;

  async function saveMeta() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("sales_prospects")
      .update({
        name: name.trim() || current.name,
        contact_name: contactName.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        province: province.trim() || null,
        notes: notes || null,
        next_follow_up: followUp || null,
        owner_id: ownerId || null,
        status: ownerId && status === "new" ? "assigned" : status,
      })
      .eq("id", current.id);
    setSaving(false);
    if (error) {
      toast(error.message);
      return;
    }
    toast(ownerId ? "บันทึกและมอบหมายแล้ว" : "บันทึกแล้ว");
    onChanged();
  }

  async function saveInteraction(
    content: string,
    nextType: InteractionType,
    ai = false,
    nextOutcome = outcome
  ) {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const nextStatus = nextStatusFromOutcome(status, nextOutcome);
    const { error: logError } = await supabase.from("sales_interactions").insert({
      prospect_id: current.id,
      type: nextType,
      outcome: nextOutcome,
      content,
      ai_generated: ai,
      created_by: user?.id ?? null,
    });
    if (logError) {
      setSaving(false);
      toast(logError.message);
      return;
    }
    const { error: updateError } = await supabase
      .from("sales_prospects")
      .update({
        status: nextStatus,
        notes: notes || content,
        next_follow_up: followUp || null,
      })
      .eq("id", current.id);
    if (updateError) {
      setSaving(false);
      toast(updateError.message);
      return;
    }
    await logActivity("update", "sales_prospect", current.id, current.name, {
      type: nextType,
      outcome: nextOutcome,
    });
    setSaving(false);
    if (nextOutcome !== "emailed") toast("บันทึกการติดต่อแล้ว");
    setLog("");
    setFromAi(false);
    onChanged();
  }

  async function convert() {
    const ok = await confirm({
      title: "แปลงเป็นดีล",
      message: `ย้าย “${current.name}” เข้าท่อขายหรือไม่?`,
      confirmLabel: "แปลงเป็นดีล",
    });
    if (!ok) return;
    setSaving(true);
    const result = await convertProspectToDeal(current);
    setSaving(false);
    if (result.error) {
      toast(result.error);
      return;
    }
    toast("ย้ายเป็นดีลแล้ว");
    onChanged();
    onClose();
  }

  function useDraft(text: string, mode: AssistMode) {
    setLog(text);
    setFromAi(true);
    setType(mode === "email" ? "email_draft" : mode === "call" ? "call" : "note");
    toast("ใส่ในบันทึกแล้ว — ตรวจแล้วค่อยส่ง");
  }

  async function sendFromTeamMail() {
    const to = email.trim() || current.contact_email;
    if (!to || !log.trim()) return;
    const ok = await confirm({
      title: "ส่งเมลจากทีม",
      message: `ส่งจาก salelimitcode@gmail.com ถึง ${name || current.name} ที่ ${to} หรือไม่? ระบบส่งให้ครั้งนี้ตามที่กดยืนยัน`,
      confirmLabel: "ส่งเมล",
    });
    if (!ok) return;
    setSending(true);
    try {
      const response = await fetch("/api/sales/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          content: log,
          prospectName: name.trim() || current.name,
        }),
      });
      const payload = (await response.json()) as { error?: string; subject?: string };
      if (!response.ok) throw new Error(payload.error || "ส่งเมลไม่สำเร็จ");
      setType("email_draft");
      setOutcome("emailed");
      await saveInteraction(log, "email_draft", fromAi, "emailed");
      toast("ส่งจาก salelimitcode@gmail.com แล้ว");
    } catch (err) {
      toast(err instanceof Error ? err.message : "ส่งเมลไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <Drawer open={Boolean(prospect)} onClose={onClose} title={prospect.name}>
      <div className="space-y-5">
        <StatusStamp
          label={PROSPECT_STATUS_LABELS[status]}
          tone={toneFromClass(PROSPECT_STATUS_COLORS[status])}
        />
        <p className="text-sm text-muted">
          {prospectCategory(prospect.extra)}
          {extraText(prospect.extra, ["ช่องทางหลัก"])
            ? ` · ${extraText(prospect.extra, ["ช่องทางหลัก"])}`
            : ""}
        </p>

        <Input
          label="ชื่อสนาม"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="ผู้ติดต่อ"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="เบอร์โทร"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="อีเมล"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="จังหวัด"
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          disabled={!canEdit}
        />
        <Select label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as ProspectStatus)} disabled={!canEdit}>
          {PROSPECT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {PROSPECT_STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select label="มอบหมายให้" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={!canEdit}>
          <option value="">ยังไม่กำหนด</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.display_name}
            </option>
          ))}
        </Select>
        <Input label="นัดติดตาม" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={!canEdit} />
        <Textarea label="บันทึกในรายชื่อ" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveMeta()}>บันทึกการแก้ไข</Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await confirm({
                    title: "ลบรายชื่อ",
                    message: `ลบรายชื่อ “${current.name}” หรือไม่?`,
                    confirmLabel: "ลบ",
                    danger: true,
                  });
                  if (!ok) return;
                  onDeleted?.(current);
                })();
              }}
            >
              ลบรายชื่อ
            </Button>
          </div>
        )}

        <AiAssistPanel
          prospect={{
            ...prospect,
            name: name || prospect.name,
            contact_name: contactName,
            contact_phone: phone,
            contact_email: email,
            province,
            notes,
            status,
          }}
          extra={log}
          onUse={useDraft}
        />

        <section className="space-y-3">
          <h3 className="font-semibold">บันทึกการติดต่อ</h3>
          <div className="grid grid-cols-2 gap-2">
            <Select label="ช่องทาง" value={type} onChange={(e) => setType(e.target.value as InteractionType)}>
              {Object.entries(INTERACTION_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Select label="ผลลัพธ์" value={outcome} onChange={(e) => setOutcome(e.target.value as InteractionOutcome)}>
              {Object.entries(INTERACTION_OUTCOME_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="สิ่งที่คุย / ร่างที่จะเก็บ"
            rows={5}
            value={log}
            onChange={(e) => setLog(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!log.trim()} variant="secondary" onClick={() => void saveInteraction(log, type, fromAi)}>
              ยืนยันและบันทึก
            </Button>
            {type === "email_draft" && log.trim() && canEdit && (
              <Button
                type="button"
                loading={sending}
                disabled={!email.trim()}
                onClick={() => void sendFromTeamMail()}
              >
                {email.trim() ? "ส่งจากเมลทีม" : "ยังไม่มีอีเมลสนาม"}
              </Button>
            )}
            {type === "email_draft" && email.trim() && log.trim() && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  const subject = encodeURIComponent(`ติดต่อจาก Limit Code Studio — ${name || prospect.name}`);
                  const body = encodeURIComponent(log);
                  const popup = window.open(`mailto:${email.trim()}?subject=${subject}&body=${body}`);
                  if (!popup) toast("เบราว์เซอร์บล็อกหน้าต่างใหม่ — คัดลอกร่างไปวางในเมลเอง");
                }}
              >
                เปิดแอปอีเมล
              </Button>
            )}
            {prospect.status !== "converted" && (
              <Button variant="ghost" onClick={() => void convert()}>
                แปลงเป็นดีล
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">ไทม์ไลน์</h3>
          {historyLoading && <p className="text-sm text-muted">กำลังโหลดบันทึก...</p>}
          {!historyLoading && history.length === 0 && <p className="text-sm text-muted">ยังไม่มีบันทึกการติดต่อ</p>}
          {history.map((item) => (
            <article key={item.id} className="rounded-xl bg-surface-soft p-3 text-sm">
              <p className="font-medium">
                {INTERACTION_TYPE_LABELS[item.type]}
                {item.outcome ? ` · ${INTERACTION_OUTCOME_LABELS[item.outcome]}` : ""}
                {item.ai_generated ? " · จาก AI" : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {new Date(item.created_at).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{item.content}</p>
            </article>
          ))}
        </section>
      </div>
    </Drawer>
  );
}
