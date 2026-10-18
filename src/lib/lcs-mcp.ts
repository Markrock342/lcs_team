import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import {
  getRepositoryFile,
  getRepositoryWorkspace,
  listWorkspaceRepositories,
} from "@/lib/github";
import type { McpIdentity } from "@/lib/mcp-auth";
import {
  createTaskAuditSummary,
  createTaskGateFromEnvironment,
  createTaskInputSchema,
  taskInsertFromMcp,
  type CreateTaskInput,
} from "@/lib/mcp-create-task";

let auditSchemaPromise: Promise<void> | null = null;

async function ensureAuditSchema() {
  if (!auditSchemaPromise) {
    auditSchemaPromise = queryNeon(`
      CREATE TABLE IF NOT EXISTS public.mcp_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(async () => {
      await queryNeon(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_user_created
        ON public.mcp_audit_logs(user_id, created_at DESC)`);
    }).catch((error) => {
      auditSchemaPromise = null;
      throw error;
    });
  }
  await auditSchemaPromise;
}

function safeInputSummary(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === "string") return [key, value.slice(0, 180)];
    if (typeof value === "number" || typeof value === "boolean" || value == null) return [key, value];
    return [key, "[complex value]"];
  }));
}

async function audit(identity: McpIdentity, toolName: string, input: Record<string, unknown> = {}) {
  await ensureAuditSchema();
  await queryNeon(`
    INSERT INTO public.mcp_audit_logs (user_id, tool_name, input_summary)
    VALUES ($1, $2, $3::jsonb)
  `, [identity.userId, toolName, JSON.stringify(safeInputSummary(input))]);
}

function toolResult(data: unknown, summary?: string) {
  return {
    structuredContent: data as Record<string, unknown>,
    content: [{ type: "text" as const, text: summary ? `${summary}\n${JSON.stringify(data)}` : JSON.stringify(data) }],
  };
}

class SafeMcpError extends Error {}

function toolError(error: unknown, fallback = "LCS tool failed") {
  console.error("[lcs-mcp]", error);
  const message = error instanceof SafeMcpError ? error.message : fallback;
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

type CreatedTask = {
  id: string;
  title: string;
  description: string | null;
  status: "pending";
  priority: "low" | "medium" | "high" | "urgent";
  progress: 0;
  client_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
};

async function createTask(identity: McpIdentity, input: CreateTaskInput) {
  await ensureAuditSchema();
  const taskInput = taskInsertFromMcp(input, identity.userId);

  return withNeonTransaction(async (client) => {
    // Re-check the authoritative Neon role inside the write transaction. The
    // role captured during authentication is only used to advertise the tool.
    const actor = await client.query<{ role: string }>(
      `SELECT role FROM public.profiles
       WHERE id = $1 AND role IN ('admin', 'pm')
       FOR SHARE`,
      [identity.userId],
    );
    if (!actor.rows[0]) {
      throw new SafeMcpError("สิทธิ์สร้างงานถูกเปลี่ยน กรุณาเชื่อมต่อใหม่");
    }

    if (input.client_id) {
      const project = await client.query(
        `SELECT id FROM public.clients WHERE id = $1 LIMIT 1`,
        [input.client_id],
      );
      if (!project.rows[0]) throw new SafeMcpError("ไม่พบโปรเจกต์ที่ระบุ");
    }

    if (input.assigned_to) {
      const assignee = await client.query(
        `SELECT id FROM public.profiles WHERE id = $1 AND role <> 'guest' LIMIT 1`,
        [input.assigned_to],
      );
      if (!assignee.rows[0]) throw new SafeMcpError("ไม่พบสมาชิกทีมที่มอบหมายได้");
    }

    const { rows } = await client.query<CreatedTask>(
      `INSERT INTO public.tasks
         (title, description, client_id, assigned_to, priority, due_date, status, progress, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, $7)
       RETURNING id, title, description, status, priority, progress,
                 client_id, assigned_to, due_date, created_by, created_at`,
      [
        taskInput.title,
        taskInput.description,
        taskInput.client_id,
        taskInput.assigned_to,
        taskInput.priority,
        taskInput.due_date,
        taskInput.created_by,
      ],
    );
    const task = rows[0];
    if (!task) throw new Error("Task insert returned no row");

    await client.query(
      `INSERT INTO public.mcp_audit_logs (user_id, tool_name, input_summary)
       VALUES ($1, 'create_task', $2::jsonb)`,
      [identity.userId, JSON.stringify(createTaskAuditSummary(input))],
    );

    return task;
  });
}

export function createLcsMcpServer(identity: McpIdentity) {
  const taskCreationEnabled = createTaskGateFromEnvironment(identity.profile.role);
  const server = new McpServer(
    { name: "lcs-team-workspace", version: "1.1.0" },
    {
      instructions: taskCreationEnabled
        ? "LCS is a private team workspace. All tools are read-only except create_task. Use create_task only after the user explicitly approves that exact task; never infer approval. Never claim to modify anything else, merge, deploy, or send messages. Never reveal credentials or infer missing data."
        : "LCS is a private team workspace. Use read-only tools to answer about the signed-in member's work, projects, team chat, and approved GitHub repositories. Never claim to modify, merge, deploy, or send messages. Never reveal credentials or infer missing data.",
      maxToolInputElements: 100,
    },
  );

  server.registerTool("get_my_profile", {
    title: "Get my LCS profile",
    description: "Use this to identify the signed-in LCS team member and their role.",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  }, async () => {
    await audit(identity, "get_my_profile");
    return toolResult({
      id: identity.profile.id,
      display_name: identity.profile.display_name,
      username: identity.profile.username,
      role: identity.profile.role,
      display_roles: identity.profile.display_roles ?? [],
    });
  });

  server.registerTool("list_projects", {
    title: "List LCS projects",
    description: "List team projects/clients with status and useful project links. Use before asking about a project.",
    inputSchema: {
      status: z.enum(["lead", "active", "completed", "paused"]).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    annotations: readOnlyAnnotations,
  }, async ({ status, limit }) => {
    try {
      await audit(identity, "list_projects", { status, limit });
      const { rows } = await queryNeon(`
        SELECT id, name, company, project_type, status, description,
               repo_url, staging_url, production_url, docs_url, updated_at
        FROM public.clients
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
        LIMIT $2
      `, [status ?? null, limit]);
      return toolResult({ projects: rows }, `พบ ${rows.length} โปรเจกต์`);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_my_tasks", {
    title: "List my tasks",
    description: "List tasks assigned to the signed-in member. Filter by status when the user asks what to work on.",
    inputSchema: {
      status: z.enum(["pending", "waiting", "in_progress", "review", "done"]).optional(),
      include_done: z.boolean().default(false),
      limit: z.number().int().min(1).max(50).default(20),
    },
    annotations: readOnlyAnnotations,
  }, async ({ status, include_done, limit }) => {
    try {
      await audit(identity, "list_my_tasks", { status, include_done, limit });
      const { rows } = await queryNeon(`
        SELECT t.id, t.title, t.description, t.status, t.priority, t.progress,
               t.start_date, t.due_date, t.updated_at,
               CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name) END AS project
        FROM public.tasks t
        LEFT JOIN public.clients c ON c.id = t.client_id
        WHERE t.assigned_to = $1
          AND ($2::text IS NULL OR t.status = $2)
          AND ($3::boolean = TRUE OR t.status <> 'done')
        ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 t.due_date ASC NULLS LAST, t.updated_at DESC
        LIMIT $4
      `, [identity.userId, status ?? null, include_done, limit]);
      return toolResult({ tasks: rows }, `พบ ${rows.length} งานที่มอบหมายให้ ${identity.profile.display_name}`);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_today_queue", {
    title: "Get today's LCS queue",
    description: "Get urgent tasks, unread notifications, and upcoming work for the signed-in member.",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  }, async () => {
    try {
      await audit(identity, "get_today_queue");
      const [tasks, notifications] = await Promise.all([
        queryNeon(`
          SELECT t.id, t.title, t.status, t.priority, t.due_date,
                 CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name) END AS project
          FROM public.tasks t LEFT JOIN public.clients c ON c.id = t.client_id
          WHERE t.assigned_to = $1 AND t.status <> 'done'
            AND (t.due_date IS NULL OR t.due_date <= CURRENT_DATE + INTERVAL '3 days')
          ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC LIMIT 20
        `, [identity.userId]),
        queryNeon(`
          SELECT id, title, body, link, created_at
          FROM public.notifications
          WHERE user_id = $1 AND read = FALSE
          ORDER BY created_at DESC LIMIT 12
        `, [identity.userId]),
      ]);
      return toolResult({ tasks: tasks.rows, notifications: notifications.rows });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_recent_team_messages", {
    title: "Get recent team messages",
    description: "Read recent messages from channels the signed-in member can access. Optionally filter by channel ID.",
    inputSchema: {
      channel_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    annotations: readOnlyAnnotations,
  }, async ({ channel_id, limit }) => {
    try {
      await audit(identity, "get_recent_team_messages", { channel_id, limit });
      const { rows } = await queryNeon(`
        SELECT m.id, m.content, m.file_name, m.created_at,
               jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind) AS channel,
               jsonb_build_object('id', p.id, 'display_name', p.display_name) AS sender
        FROM public.messages m
        JOIN public.channels c ON c.id = m.channel_id
        LEFT JOIN public.profiles p ON p.id = m.sender_id
        WHERE m.deleted_at IS NULL AND m.thread_id IS NULL
          AND ($2::uuid IS NULL OR c.id = $2)
          AND (COALESCE(c.kind, 'channel') <> 'dm' OR c.created_by = $1 OR EXISTS (
            SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1
          ))
        ORDER BY m.created_at DESC LIMIT $3
      `, [identity.userId, channel_id ?? null, limit]);
      return toolResult({ messages: rows }, `พบ ${rows.length} ข้อความล่าสุด`);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("search_workspace", {
    title: "Search LCS workspace",
    description: "Search project names, task titles, and accessible team messages for a specific keyword.",
    inputSchema: { query: z.string().trim().min(2).max(120) },
    annotations: readOnlyAnnotations,
  }, async ({ query }) => {
    try {
      await audit(identity, "search_workspace", { query });
      const term = `%${query}%`;
      const [projects, tasks, messages] = await Promise.all([
        queryNeon(`SELECT id, name, status, description FROM public.clients
          WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY updated_at DESC LIMIT 8`, [term]),
        queryNeon(`SELECT t.id, t.title, t.status, t.priority, c.name AS project_name
          FROM public.tasks t LEFT JOIN public.clients c ON c.id = t.client_id
          WHERE t.title ILIKE $1 OR t.description ILIKE $1 ORDER BY t.updated_at DESC LIMIT 10`, [term]),
        queryNeon(`SELECT m.id, m.content, m.created_at, c.id AS channel_id, c.name AS channel_name
          FROM public.messages m JOIN public.channels c ON c.id = m.channel_id
          WHERE m.deleted_at IS NULL AND m.content ILIKE $2
            AND (COALESCE(c.kind, 'channel') <> 'dm' OR c.created_by = $1 OR EXISTS (
              SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1
            ))
          ORDER BY m.created_at DESC LIMIT 10`, [identity.userId, term]),
      ]);
      return toolResult({ projects: projects.rows, tasks: tasks.rows, messages: messages.rows });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_repositories", {
    title: "List approved GitHub repositories",
    description: "List GitHub repositories explicitly linked to LCS projects. Only these repositories can be read.",
    inputSchema: {},
    annotations: { ...readOnlyAnnotations, openWorldHint: true },
  }, async () => {
    try {
      await audit(identity, "list_repositories");
      const repositories = await listWorkspaceRepositories();
      return toolResult({ repositories }, `พบ ${repositories.length} repository ที่อนุญาต`);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_repository_activity", {
    title: "Get repository activity",
    description: "Get the default branch, recent commits, and open pull requests from an approved GitHub repository.",
    inputSchema: { repository: z.string().min(3).max(200) },
    annotations: { ...readOnlyAnnotations, openWorldHint: true },
  }, async ({ repository }) => {
    try {
      await audit(identity, "get_repository_activity", { repository });
      const workspace = await getRepositoryWorkspace(repository);
      return toolResult({
        repository: workspace.repository,
        project: workspace.project,
        branch: workspace.branch,
        file_count: workspace.tree.filter((item) => item.type === "blob").length,
        commits: workspace.commits,
        pull_requests: workspace.pulls,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_repository_files", {
    title: "List repository files",
    description: "List readable source files in an approved repository. Secret and binary paths are excluded.",
    inputSchema: {
      repository: z.string().min(3).max(200),
      prefix: z.string().max(300).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    },
    annotations: { ...readOnlyAnnotations, openWorldHint: true },
  }, async ({ repository, prefix, limit }) => {
    try {
      await audit(identity, "list_repository_files", { repository, prefix, limit });
      const workspace = await getRepositoryWorkspace(repository);
      const normalizedPrefix = prefix?.replace(/^\/+/, "") ?? "";
      const files = workspace.tree
        .filter((item) => item.type === "blob" && (!normalizedPrefix || item.path.startsWith(normalizedPrefix)))
        .slice(0, limit)
        .map(({ path, size, sha }) => ({ path, size: size ?? null, sha }));
      return toolResult({ repository: workspace.repository.full_name, branch: workspace.branch, files });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("read_repository_file", {
    title: "Read repository source file",
    description: "Read one text source file from an approved repository. Secret, credential, key, and binary files are blocked.",
    inputSchema: {
      repository: z.string().min(3).max(200),
      path: z.string().min(1).max(500),
      ref: z.string().max(200).optional(),
    },
    annotations: { ...readOnlyAnnotations, openWorldHint: true },
  }, async ({ repository, path, ref }) => {
    try {
      await audit(identity, "read_repository_file", { repository, path, ref });
      const file = await getRepositoryFile(repository, path, ref);
      return toolResult({
        repository: file.repository,
        path: file.path,
        ref: file.ref,
        sha: file.sha,
        size: file.size,
        content: file.content.slice(0, 120_000),
        truncated_for_chatgpt: file.content.length > 120_000,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  if (taskCreationEnabled) {
    server.registerTool("create_task", {
      title: "Create one LCS task",
      description:
        "Create exactly one LCS task after the user explicitly confirms this exact task. The server controls author, initial status, and progress.",
      inputSchema: createTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    }, async (input) => {
      try {
        const task = await createTask(identity, input);
        return toolResult({ task }, `สร้างงาน “${task.title}” สำเร็จ`);
      } catch (error) {
        return toolError(error, "สร้างงานไม่สำเร็จ กรุณาลองใหม่หรือตรวจสิทธิ์สมาชิก");
      }
    });
  }

  return server;
}
