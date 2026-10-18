import { z } from "zod";
import type { TeamRole } from "./types";

export const CREATE_TASK_WRITE_FLAGS = {
  enabled: "LCS_MCP_ENABLE_TASK_CREATION",
  roleGuardVerified: "LCS_MCP_ROLE_GUARD_VERIFIED",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const optionalUuid = z.string().regex(UUID_RE, "ต้องเป็น UUID ที่ถูกต้อง").optional();
const optionalDate = z.string().refine(isRealIsoDate, "ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD").optional();

/**
 * Strict by design: callers cannot set authorship, status, progress, or any
 * future task field unless it is deliberately added to this allowlist.
 */
export const createTaskInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  client_id: optionalUuid,
  assigned_to: optionalUuid,
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: optionalDate,
  confirm: z.literal(true),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

type CreateTaskGateConfig = {
  enabled?: string;
  roleGuardVerified?: string;
};

export function canCreateTask(role: TeamRole | string | null | undefined, config: CreateTaskGateConfig) {
  return (role === "admin" || role === "pm")
    && config.enabled === "true"
    && config.roleGuardVerified === "true";
}

export function createTaskGateFromEnvironment(role: TeamRole, environment: NodeJS.ProcessEnv = process.env) {
  return canCreateTask(role, {
    enabled: environment[CREATE_TASK_WRITE_FLAGS.enabled],
    roleGuardVerified: environment[CREATE_TASK_WRITE_FLAGS.roleGuardVerified],
  });
}

export function createTaskAuditSummary(input: CreateTaskInput) {
  return {
    title: input.title,
    client_id: input.client_id ?? null,
    assigned_to: input.assigned_to ?? null,
    priority: input.priority,
    due_date: input.due_date ?? null,
    confirmed: true,
  };
}

export function taskInsertFromMcp(input: CreateTaskInput, actorId: string) {
  return {
    title: input.title,
    description: input.description || null,
    client_id: input.client_id ?? null,
    assigned_to: input.assigned_to ?? null,
    priority: input.priority,
    due_date: input.due_date ?? null,
    status: "pending" as const,
    progress: 0 as const,
    created_by: actorId,
  };
}
