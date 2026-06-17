import Image from "next/image";
import type { TaskStatus, TeamRole, Profile } from "@/lib/types";
import { getProfileDisplayRoles } from "@/lib/profile-display";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  ROLE_LABELS,
  ROLE_COLORS,
} from "@/lib/constants";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${TASK_STATUS_COLORS[status]}`}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
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

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  const colors = [
    "bg-[#00a3ff]",
    "bg-orange-600",
    "bg-pink-600",
    "bg-violet-600",
    "bg-emerald-600",
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
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4 text-muted">
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-sm">{description}</p>
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-2xl animate-slide-up pb-safe">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-card-hover flex items-center justify-center text-muted hover:text-foreground transition-colors"
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
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <input
        {...props}
        className={`w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all ${props.className ?? ""}`}
      />
    </div>
  );
}

export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <select
        {...props}
        className={`w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all appearance-none ${props.className ?? ""}`}
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
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <textarea
        {...props}
        className={`w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all resize-y ${props.className ?? ""}`}
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
      "bg-accent hover:bg-accent-dim text-white font-semibold shadow-lg shadow-accent/25",
    secondary:
      "bg-card hover:bg-card-hover border border-border text-foreground",
    danger: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30",
    ghost: "hover:bg-card-hover text-muted hover:text-foreground",
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${props.className ?? ""}`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
