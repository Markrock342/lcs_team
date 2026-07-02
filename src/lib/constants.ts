import type {
  ClientStatus,
  ProjectType,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from "./types";

export const TEAM = {
  name: "Limit Code Studio",
  shortName: "LCS",
  tagline: "Freelance Software House",
  members: [
    { username: "mark", displayName: "Mark", role: "pm" as TeamRole, title: "Project Manager" },
    { username: "knott", displayName: "Knott", role: "backend" as TeamRole, title: "Backend Developer" },
    { username: "bank", displayName: "Bank", role: "design" as TeamRole, title: "UX/UI & Frontend" },
  ],
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  mobile_app: "📱 แอพมือถือ",
  web_app: "🌐 Web Application",
  website: "🏠 เว็บไซต์",
  system: "⚙️ ระบบภายใน",
  design: "🎨 UI/UX Design",
  maintenance: "🔧 ดูแล/บำรุงรักษา",
  consulting: "💡 ที่ปรึกษา/วางระบบ",
  other: "📋 อื่นๆ",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "ลูกค้าใหม่",
  active: "กำลังทำ",
  completed: "เสร็จแล้ว",
  paused: "พักงาน",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "ยังไม่เริ่ม",
  waiting: "รอดำเนินการ",
  in_progress: "กำลังทำ",
  review: "รอตรวจ",
  done: "เสร็จแล้ว",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  waiting: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  in_progress: "bg-[#00a3ff]/20 text-[#00a3ff] border-[#00a3ff]/30",
  review: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  done: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  urgent: "ด่วน",
};

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Admin",
  pm: "PM",
  backend: "Backend",
  design: "Design/Frontend",
  guest: "Guest",
};

export const ROLE_COLORS: Record<TeamRole, string> = {
  admin: "bg-red-500/20 text-red-300",
  pm: "bg-orange-500/20 text-orange-300",
  backend: "bg-[#00a3ff]/20 text-[#00a3ff]",
  design: "bg-pink-500/20 text-pink-300",
  guest: "bg-zinc-500/20 text-zinc-300",
};

export const CLIENT_LINK_FIELDS = [
  { key: "repo_url", label: "Git Repo", placeholder: "https://github.com/..." },
  { key: "supabase_url", label: "Supabase", placeholder: "https://xxx.supabase.co" },
  { key: "figma_url", label: "Figma", placeholder: "https://figma.com/..." },
  { key: "staging_url", label: "Staging", placeholder: "https://staging.example.com" },
  { key: "production_url", label: "Production", placeholder: "https://example.com" },
  { key: "docs_url", label: "Docs / Notion", placeholder: "https://notion.so/..." },
  { key: "drive_url", label: "Google Drive", placeholder: "https://drive.google.com/..." },
] as const;

export const TASK_BAR_COLORS = [
  { bg: "bg-[#00a3ff]/35", text: "text-[#7dd3ff]", border: "border-[#00a3ff]/60" },
  { bg: "bg-emerald-400/30", text: "text-emerald-200", border: "border-emerald-400/55" },
  { bg: "bg-violet-400/30", text: "text-violet-200", border: "border-violet-400/55" },
  { bg: "bg-orange-400/30", text: "text-orange-200", border: "border-orange-400/55" },
  { bg: "bg-pink-400/30", text: "text-pink-200", border: "border-pink-400/55" },
  { bg: "bg-amber-400/30", text: "text-amber-100", border: "border-amber-400/55" },
  { bg: "bg-cyan-300/30", text: "text-cyan-100", border: "border-cyan-300/55" },
  { bg: "bg-rose-400/30", text: "text-rose-200", border: "border-rose-400/55" },
];
