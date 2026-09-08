"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import type {
  ClientStatus,
  SalesStage,
  TaskPriority,
  TaskStatus,
  TeamRole,
  Profile,
} from "@/lib/types";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  SALES_STAGE_COLORS,
  SALES_STAGE_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  ROLE_LABELS,
  ROLE_COLORS,
} from "@/lib/constants";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const nodes = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function useDialogFocus(open: boolean, onClose: () => void, dialogRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (dialogRef.current) trapFocus(dialogRef.current, event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, dialogRef]);
}

export function Card({
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { interactive?: boolean }) {
  return (
    <section
      {...props}
      className={classes(interactive ? "job-jacket" : "ticket-card", className)}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 py-3.5 border-b border-border">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export type StatusTone = "slate" | "blue" | "amber" | "violet" | "green" | "red";

export function StatusStamp({
  label,
  tone = "slate",
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={classes("status-stamp", `status-${tone}`, className)}>
      {label}
    </span>
  );
}

function toneFromClass(value: string): StatusTone {
  return value.replace("status-", "") as StatusTone;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <StatusStamp label={TASK_STATUS_LABELS[status]} tone={toneFromClass(TASK_STATUS_COLORS[status])} />;
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <StatusStamp label={CLIENT_STATUS_LABELS[status]} tone={toneFromClass(CLIENT_STATUS_COLORS[status])} />;
}

export function SalesStageBadge({ stage }: { stage: SalesStage }) {
  return <StatusStamp label={SALES_STAGE_LABELS[stage]} tone={toneFromClass(SALES_STAGE_COLORS[stage])} />;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <StatusStamp label={`ความสำคัญ ${TASK_PRIORITY_LABELS[priority]}`} tone={toneFromClass(TASK_PRIORITY_COLORS[priority])} />;
}

export function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_COLORS[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function ProfileRoleBadges({
  profile,
  size = "sm",
}: {
  profile: Pick<Profile, "role" | "display_roles">;
  size?: "sm" | "xs";
}) {
  const roles = getProfileDisplayRoles(profile);
  const text = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {roles.map((role) => (
        <span
          key={role}
          className={`inline-flex items-center rounded-md font-medium ${text} ${ROLE_COLORS[role]}`}
        >
          {ROLE_LABELS[role]}
        </span>
      ))}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sizeClass = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base",
  }[size];

  const px = { sm: 28, md: 36, lg: 48 }[size];

  if (src && failedSrc !== src) {
    return (
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  const colors = [
    "bg-accent",
    "bg-(--status-amber-fg)",
    "bg-(--status-violet-fg)",
    "bg-(--status-green-fg)",
    "bg-(--status-blue-fg)",
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;

  return (
    <div
      className={`${sizeClass} ${colors[colorIndex]} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
    >
      {initials}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-soft flex items-center justify-center text-muted">
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted max-w-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function PageLoader({ label = "กำลังโหลด..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted" role="status" aria-live="polite">
      <span className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "ไม่สามารถโหลดข้อมูลได้",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-(--status-red-bg) p-4 text-(--status-red-fg)" role="alert">
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl bg-card px-4 text-sm font-semibold text-foreground hover:bg-card-hover active:scale-[0.98]">
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface-soft p-4">
      <div className="flex items-center justify-between gap-3 text-muted">
        <p className="text-sm">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ListRow({
  title,
  description,
  leading,
  trailing,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("flex min-h-16 items-center gap-3 px-4 py-3", className)}>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-background/75"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl animate-slide-up pb-safe shadow-(--shadow-float)"
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="w-11 h-11 rounded-xl hover:bg-card-hover active:scale-[0.98] flex items-center justify-center text-muted hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-muted">{label}</label>
      )}
      <input
        {...props}
        id={id}
        className={`w-full min-h-11 px-3.5 py-2.5 bg-background border border-border rounded-xl text-base placeholder:text-muted/70 focus-visible:border-accent transition-colors ${props.className ?? ""}`}
      />
    </div>
  );
}

export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-muted">{label}</label>
      )}
      <select
        {...props}
        id={id}
        className={`w-full min-h-11 px-3.5 py-2.5 bg-background border border-border rounded-xl text-base focus-visible:border-accent transition-colors appearance-none ${props.className ?? ""}`}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-muted">{label}</label>
      )}
      <textarea
        {...props}
        id={id}
        className={`w-full min-h-24 px-3.5 py-2.5 bg-background border border-border rounded-xl text-base placeholder:text-muted focus-visible:border-accent transition-colors resize-y ${props.className ?? ""}`}
      />
    </div>
  );
}

export function Button({
  variant = "primary",
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  const variants = {
    primary:
      "bg-accent hover:bg-accent-dim text-white font-semibold shadow-sm",
    secondary:
      "bg-card hover:bg-card-hover border border-border text-foreground",
    danger: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30",
    ghost: "hover:bg-card-hover text-muted hover:text-foreground",
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${props.className ?? ""}`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-background/70"
        aria-label="ปิดแผงรายละเอียด"
        onClick={onClose}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-(--shadow-float) animate-slide-up"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
