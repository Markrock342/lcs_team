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
import { useActionFeedback } from "@/components/workspace/ActionFeedback";

function toneFromClass(value: string) {
  return value.replace("status-", "") as "slate" | "blue" | "amber" | "violet" | "green" | "red";
}

export function ProspectDrawer({
  prospect,
  profiles,
  onClose,
  onChanged,
}: {
  prospect: SalesProspect | null;
  profiles: Profile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast, setSaving } = useActionFeedback();
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState<ProspectStatus>("new");
  const [outcome, setOutcome] = useState<InteractionOutcome>("reached");
  const [type, setType] = useState<InteractionType>("call");
  const [log, setLog] = useState("");
  const [fromAi, setFromAi] = useState(false);
  const [history, setHistory] = useState<SalesInteraction[]>([]);

  useEffect(() => {
    if (!prospect) return;
    // Sync drawer fields when a different prospect is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(prospect.notes ?? "");
    setFollowUp(prospect.next_follow_up ?? "");
    setOwnerId(prospect.owner_id ?? "");
    setStatus(prospect.status);
    setFromAi(false);
    setLog("");
    const supabase = createClient();
    void supabase
      .from("sales_interactions")
      .select("*, creator:profiles!sales_interactions_created_by_fkey(*)")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setHistory((data as SalesInteraction[]) ?? []));
  }, [prospect]);

  if (!prospect) return null;
  const current = prospect;

  async function saveMeta() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("sales_prospects")
      .update({
        notes: notes || null,
        next_follow_up: followUp || null,
        owner_id: ownerId || null,
        status,
      })
      .eq("id", current.id);
    setSaving(false);
    toast("บันทึกแล้ว");
    onChanged();
  }

  async function saveInteraction(content: string, nextType: InteractionType, ai = false) {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const nextStatus = nextStatusFromOutcome(status, outcome);
    await supabase.from("sales_interactions").insert({
      prospect_id: current.id,
      type: nextType,
      outcome,
      content,
      ai_generated: ai,
      created_by: user?.id ?? null,
    });
    await supabase
      .from("sales_prospects")
      .update({
        status: nextStatus,
        notes: notes || content,
        next_follow_up: followUp || null,
      })
      .eq("id", current.id);
    await logActivity("update", "sales_prospect", current.id, current.name, {
      type: nextType,
      outcome,
    });
    setSaving(false);
    toast("บันทึกการติดต่อแล้ว");
    setLog("");
    setFromAi(false);
    onChanged();
  }

  async function convert() {
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
  }

  return (
    <Drawer open={Boolean(prospect)} onClose={onClose} title={prospect.name}>
      <div className="space-y-5">
        <StatusStamp
          label={PROSPECT_STATUS_LABELS[status]}
          tone={toneFromClass(PROSPECT_STATUS_COLORS[status])}
        />
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-muted">ผู้ติดต่อ</dt>
            <dd>{prospect.contact_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">โทร</dt>
            <dd>
              {prospect.contact_phone ? (
                <a className="text-accent" href={`tel:${prospect.contact_phone}`}>
                  {prospect.contact_phone}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">อีเมล</dt>
            <dd>
              {prospect.contact_email ? (
                <a className="text-accent" href={`mailto:${prospect.contact_email}`}>
                  {prospect.contact_email}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">ที่อยู่</dt>
            <dd>{[prospect.address, prospect.province].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        </dl>

        <Select label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as ProspectStatus)}>
          {PROSPECT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {PROSPECT_STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select label="ผู้รับผิดชอบ" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">ยังไม่กำหนด</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.display_name}
            </option>
          ))}
        </Select>
        <Input label="นัดติดตาม" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        <Textarea label="บันทึกในรายชื่อ" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={() => void saveMeta()}>บันทึกข้อมูล</Button>

        <AiAssistPanel prospect={{ ...prospect, notes, status }} extra={log} onUse={useDraft} />

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
            <Button disabled={!log.trim()} onClick={() => void saveInteraction(log, type, fromAi)}>
              ยืนยันและบันทึก
            </Button>
            {type === "email_draft" && prospect.contact_email && log.trim() && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  const subject = encodeURIComponent(`ติดต่อจาก Limit Code Studio — ${prospect.name}`);
                  const body = encodeURIComponent(log);
                  window.open(`mailto:${prospect.contact_email}?subject=${subject}&body=${body}`);
                }}
              >
                เปิดแอปอีเมล
              </Button>
            )}
            {prospect.status !== "converted" && (
              <Button variant="secondary" onClick={() => void convert()}>
                แปลงเป็นดีล
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">ไทม์ไลน์</h3>
          {history.length === 0 && <p className="text-sm text-muted">ยังไม่มีบันทึกการติดต่อ</p>}
          {history.map((item) => (
            <article key={item.id} className="rounded-xl bg-surface-soft p-3 text-sm">
              <p className="font-medium">
                {INTERACTION_TYPE_LABELS[item.type]}
                {item.outcome ? ` · ${INTERACTION_OUTCOME_LABELS[item.outcome]}` : ""}
                {item.ai_generated ? " · จาก AI" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{item.content}</p>
            </article>
          ))}
        </section>
      </div>
    </Drawer>
  );
}
