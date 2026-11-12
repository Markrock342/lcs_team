"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronDown, FileText, Paperclip, X } from "lucide-react";
import { Avatar } from "@/components/ui";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** กลุ่มช่องกรอกที่มีหัวข้อ — ใช้แบ่งฟอร์มยาวให้อ่านเป็นช่วง ๆ บนมือถือ */
export function FormSection({
  title,
  hint,
  step,
  children,
}: {
  title: string;
  hint?: string;
  step?: number;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="flex w-full items-center gap-2.5 pb-1">
        {step !== undefined && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent tabular-nums">
            {step}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-base font-semibold leading-snug">{title}</span>
          {hint && <span className="block text-sm leading-snug text-muted">{hint}</span>}
        </span>
      </legend>
      {children}
    </fieldset>
  );
}

/** ส่วนเสริมที่พับเก็บได้ — ซ่อนช่องที่ไม่จำเป็นต้องกรอกทุกครั้ง */
export function FormDisclosure({
  title,
  hint,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left touch-manipulation"
      >
        {icon && <span className="shrink-0 text-accent">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium leading-snug">{title}</span>
          {hint && <span className="block text-sm leading-snug text-muted">{hint}</span>}
        </span>
        <ChevronDown
          size={18}
          className={classes("shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  tone?: "accent" | "green" | "red";
};

/** ตัวเลือกแบบปุ่ม — แตะครั้งเดียวแทน dropdown */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** กำหนดจำนวนคอลัมน์คงที่ (เช่น 2 สำหรับ รายรับ/รายจ่าย) — ไม่กำหนด = เรียงต่อกันแล้วขึ้นบรรทัดใหม่ */
  columns?: 2 | 3;
}) {
  const activeTone = {
    accent: "border-accent bg-accent/12 text-accent",
    green: "border-(--status-green-fg) bg-(--status-green-bg) text-(--status-green-fg)",
    red: "border-(--status-red-fg) bg-(--status-red-bg) text-(--status-red-fg)",
  };
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className={
          columns === 2
            ? "grid grid-cols-2 gap-2"
            : columns === 3
              ? "grid grid-cols-3 gap-2"
              : "flex flex-wrap gap-2"
        }
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={classes(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[0.9375rem] font-medium transition-colors touch-manipulation",
                active
                  ? activeTone[option.tone ?? "accent"]
                  : "border-border bg-background text-foreground hover:bg-card-hover"
              )}
            >
              {active && <Check size={16} className="shrink-0" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatAmountPreview(value: string) {
  const amount = parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** ช่องจำนวนเงินตัวใหญ่ — แป้นตัวเลขบนมือถือ พร้อมปุ่มลัด */
export function AmountField({
  label,
  value,
  onChange,
  tone = "neutral",
  required = true,
  shortcuts,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tone?: "neutral" | "income" | "expense";
  required?: boolean;
  shortcuts?: { label: string; value: number }[];
  hint?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const preview = formatAmountPreview(value);
  const toneClass = {
    neutral: "text-foreground",
    income: "text-(--status-green-fg)",
    expense: "text-(--status-red-fg)",
  }[tone];
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <div className="flex min-h-16 items-center gap-2 rounded-2xl border border-border bg-background px-4 focus-within:border-accent">
        <span className={classes("text-2xl font-semibold", toneClass)} aria-hidden="true">
          ฿
        </span>
        <input
          id={id}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          enterKeyHint="next"
          placeholder="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          autoFocus={autoFocus}
          className={classes(
            "amount-input min-w-0 flex-1 bg-transparent py-3 font-semibold tabular-nums outline-none placeholder:text-muted/60",
            toneClass
          )}
        />
      </div>
      {(preview || hint) && (
        <p className="text-sm text-muted" aria-live="polite">
          {preview && <span className="tabular-nums">{preview} บาท</span>}
          {preview && hint ? " · " : ""}
          {hint}
        </p>
      )}
      {shortcuts && shortcuts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => onChange(String(shortcut.value))}
              className="min-h-11 rounded-xl border border-border bg-card px-3.5 text-sm font-medium hover:bg-card-hover touch-manipulation"
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type PersonOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  detail?: string;
  warning?: boolean;
};

/** เลือกสมาชิกแบบรายการ — ชื่อเต็มบรรทัด ไม่ตัดคำ */
export function PersonPicker({
  label,
  people,
  value,
  onChange,
}: {
  label: string;
  people: PersonOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {people.map((person) => {
          const active = person.id === value;
          return (
            <button
              key={person.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(person.id)}
              className={classes(
                "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors touch-manipulation",
                active ? "border-accent bg-accent/10" : "border-border bg-background hover:bg-card-hover"
              )}
            >
              <Avatar name={person.name} src={person.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium leading-snug">{person.name}</span>
                {person.detail && (
                  <span
                    className={classes(
                      "block truncate text-sm leading-snug",
                      person.warning ? "text-(--status-amber-fg)" : "text-muted"
                    )}
                  >
                    {person.detail}
                  </span>
                )}
              </span>
              <span
                className={classes(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-accent bg-accent text-on-accent" : "border-border"
                )}
                aria-hidden="true"
              >
                {active && <Check size={14} />}
              </span>
            </button>
          );
        })}
      </div>
      {people.length === 0 && <p className="text-sm text-muted">ยังไม่มีสมาชิกให้เลือก</p>}
    </div>
  );
}

/** แนบสลิป/หลักฐาน — เห็นรูปตัวอย่างและลบออกได้ */
export function SlipField({
  label,
  file,
  onChange,
  existingName,
  emptyText = "แตะเพื่อเลือกรูปสลิปหรือ PDF",
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  existingName?: string | null;
  emptyText?: string;
}) {
  const id = useId();
  const previewUrl = useMemo(
    () => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const input = (
    <input
      id={id}
      type="file"
      accept="image/*,.pdf,image/heic,image/heif"
      className="sr-only"
      onChange={(event) => {
        onChange(event.target.files?.[0] ?? null);
        event.target.value = "";
      }}
    />
  );

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-muted">{label}</p>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
            <img src={previewUrl} alt="ตัวอย่างสลิป" className="size-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted">
              <FileText size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-medium">{file.name}</p>
            <label htmlFor={id} className="inline-flex min-h-8 cursor-pointer items-center text-sm font-medium text-accent">
              เปลี่ยนไฟล์
            </label>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="เอาไฟล์ออก"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
          {input}
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-3 hover:border-accent/60 touch-manipulation"
        >
          <Paperclip size={20} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 text-[0.9375rem] text-muted">
            {existingName ? (
              <>
                <span className="block truncate text-foreground">{existingName}</span>
                <span className="block text-sm">แตะเพื่อเปลี่ยนไฟล์</span>
              </>
            ) : (
              emptyText
            )}
          </span>
          {input}
        </label>
      )}
    </div>
  );
}

/** แถบปุ่มบันทึกติดขอบล่างของ Modal — เห็นยอดสรุปและกดบันทึกได้โดยไม่ต้องเลื่อนสุด */
export function FormActions({
  summary,
  children,
}: {
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sheet-actions">
      {summary && <div className="mb-2 text-sm leading-snug text-muted">{summary}</div>}
      <div className="flex gap-2 [&>button]:flex-1 [&>button]:text-base">{children}</div>
    </div>
  );
}

/** กล่องแจ้งข้อผิดพลาดในฟอร์ม */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl bg-(--status-red-bg) px-4 py-3 text-[0.9375rem] text-(--status-red-fg)">
      {message}
    </div>
  );
}
