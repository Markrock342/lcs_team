export type TeamRole = "admin" | "pm" | "backend" | "design";

export type TaskStatus =
  | "pending"
  | "waiting"
  | "in_progress"
  | "review"
  | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type ClientStatus = "lead" | "active" | "completed" | "paused";

export type ProjectType =
  | "mobile_app"
  | "web_app"
  | "website"
  | "system"
  | "design"
  | "maintenance"
  | "consulting"
  | "other";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: TeamRole;
  display_roles: TeamRole[] | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  company: string | null;
  project_type: ProjectType;
  description: string | null;
  budget: number | null;
  notes: string | null;
  image_url: string | null;
  repo_url: string | null;
  supabase_url: string | null;
  figma_url: string | null;
  staging_url: string | null;
  production_url: string | null;
  docs_url: string | null;
  drive_url: string | null;
  status: ClientStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  parent_id: string | null;
  client_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  start_date: string | null;
  due_date: string | null;
  duration_days: number;
  progress: number;
  image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
  assignee?: Profile | null;
  subtasks?: Task[];
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MessageRead {
  user_id: string;
  read_at: string;
  reader?: Pick<Profile, "id" | "display_name" | "username"> | null;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  reply_to_id: string | null;
  deleted_at: string | null;
  mentioned_ids?: string[] | null;
  created_at: string;
  sender?: Profile | null;
  reply_to?: Pick<
    Message,
    "id" | "content" | "sender_id" | "deleted_at" | "file_name"
  > & { sender?: Pick<Profile, "display_name"> | null } | null;
  reads?: MessageRead[];
}
