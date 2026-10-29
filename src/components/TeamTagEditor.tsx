"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { validateTeamTags } from "@/lib/team-tags";

export function TeamTagEditor({ tags, suggestions, onSave }: {
  tags: string[];
  suggestions: string[];
  onSave: (tags: string[]) => Promise<void>;
}) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(next: string[]) {
    if (saving) return;
    const result = validateTeamTags(next);
    if (result.error) { setError(result.error); return; }
    setSaving(true); setError(""); setSaved(false);
    try { await onSave(result.tags!); setName(""); setSaved(true); }
    catch (error) { setError(error instanceof Error ? error.message : "บันทึกป้ายไม่สำเร็จ ลองอีกครั้ง"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-2">
    <label htmlFor={inputId} className="block text-sm font-medium">ป้ายทีมกำหนดเอง</label>
    {tags.length > 0 && <div className="flex flex-wrap gap-2">
      {tags.map((tag) => <button key={tag} type="button" disabled={saving} onClick={() => void save(tags.filter((item) => item !== tag))}
        aria-label={`ลบป้าย ${tag}`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-border bg-surface-soft px-3 text-sm disabled:opacity-50">
        <span className="break-words">{tag}</span><X size={14} className="shrink-0" />
      </button>)}
    </div>}
    <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) void save([...tags, name]); }} className="flex gap-2">
      <input id={inputId} list={`${inputId}-suggestions`} value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }}
        disabled={saving || tags.length >= 10} placeholder="เช่น QA, DevOps, ทีมวิดีโอ" maxLength={64}
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base disabled:opacity-50" />
      <datalist id={`${inputId}-suggestions`}>{suggestions.filter((tag) => !tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}</datalist>
      <Button type="submit" variant="secondary" loading={saving} disabled={!name.trim() || tags.length >= 10}><Plus size={16} /> เพิ่ม</Button>
    </form>
    <p className="text-xs leading-relaxed text-muted">สูงสุด 10 ป้าย · ป้ายเหล่านี้ใช้แสดงหน้าที่ในทีม และไม่เพิ่มสิทธิ์เข้าถึงข้อมูล</p>
    {error && <p role="alert" className="text-sm text-(--status-red-fg)">{error}</p>}
    {saved && <p role="status" className="text-sm text-(--status-green-fg)">บันทึกป้ายแล้ว</p>}
  </div>;
}
