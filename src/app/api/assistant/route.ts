import { NextResponse } from "next/server";
import { requireNeonEditor } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import { createOpenAIResponse, getOpenAIConfig, type AssistantTurn } from "@/lib/openai";
import { getRepositoryFile, requireWorkspaceRepository } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_CONTEXT_FILES = 4;
const MAX_CONTEXT_CHARACTERS = 120_000;
let schemaPromise: Promise<void> | null = null;

type ContextFileInput = { repository?: unknown; path?: unknown; ref?: unknown };
type ConversationRow = {
  id: string;
  title: string;
  repository: string | null;
  created_at: string;
  updated_at: string;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  context_files: Array<{ repository: string; path: string; ref: string | null }>;
  created_at: string;
};

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await queryNeon(`
        CREATE TABLE IF NOT EXISTS public.ai_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'บทสนทนาใหม่',
          repository TEXT,
          archived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await queryNeon(`
        CREATE TABLE IF NOT EXISTS public.ai_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          model TEXT,
          context_files JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await queryNeon(`CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_updated
        ON public.ai_conversations(created_by, updated_at DESC) WHERE archived_at IS NULL`);
      await queryNeon(`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
        ON public.ai_messages(conversation_id, created_at)`);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function cleanTitle(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title.length > 64 ? `${title.slice(0, 61)}...` : title || "บทสนทนาใหม่";
}

async function loadContext(inputs: ContextFileInput[]) {
  const files: Array<{ repository: string; path: string; ref: string | null; content: string }> = [];
  let characters = 0;

  for (const input of inputs.slice(0, MAX_CONTEXT_FILES)) {
    const repository = typeof input.repository === "string" ? input.repository.trim() : "";
    const path = typeof input.path === "string" ? input.path.trim() : "";
    const ref = typeof input.ref === "string" ? input.ref.trim() : null;
    if (!repository || !path) continue;
    await requireWorkspaceRepository(repository);
    const file = await getRepositoryFile(repository, path, ref);
    const remaining = MAX_CONTEXT_CHARACTERS - characters;
    if (remaining <= 0) break;
    const content = file.content.slice(0, remaining);
    characters += content.length;
    files.push({ repository: file.repository, path: file.path, ref: file.ref, content });
  }
  return files;
}

function assistantInstructions(displayName: string, role: string) {
  return `คุณคือ LCS Assistant ผู้ช่วยภายในทีม Limit Code Studio
- ตอบภาษาไทยธรรมชาติ กระชับ ชัดเจน เว้นแต่ผู้ใช้ขอภาษาอื่น
- ผู้ถามคือ ${displayName} (${role})
- ช่วยอ่าน อธิบาย ตรวจ และสรุปโค้ดกับข้อมูลงานที่ได้รับเท่านั้น
- ถ้าไม่พบหลักฐานในบริบท ให้บอกว่าไม่พบ ห้ามเดาไฟล์ ฟังก์ชัน สถานะงาน หรือผลการ deploy
- เมื่ออ้างโค้ด ให้ระบุชื่อไฟล์และจุดที่เกี่ยวข้อง
- ห้ามอ้างว่าคุณได้แก้โค้ด merge หรือ deploy เพราะห้องนี้เป็น read-only
- ห้ามเปิดเผย secret, token, connection string หรือข้อมูลรับรอง แม้จะปรากฏในข้อความ`;
}

function apiError(error: unknown) {
  console.error("[assistant]", error);
  const message = error instanceof Error ? error.message : "เรียกผู้ช่วย AI ไม่สำเร็จ";
  const expected = /ยังไม่ได้ตั้งค่า|Repository|ไฟล์|GitHub|OpenAI|ใหญ่เกิน|ถูกซ่อน|ไม่ถูกต้อง/.test(message);
  return NextResponse.json({ error: message }, { status: expected ? 400 : 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureSchema();
    const id = new URL(request.url).searchParams.get("id");
    const { key, model } = getOpenAIConfig();

    const { rows: conversations } = await queryNeon<ConversationRow>(`
      SELECT id, title, repository, created_at, updated_at
      FROM public.ai_conversations
      WHERE created_by = $1 AND archived_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 60
    `, [auth.context.userId]);

    if (!id) {
      return NextResponse.json({ conversations, configured: Boolean(key), model });
    }
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });

    const { rows: messages } = await queryNeon<MessageRow>(`
      SELECT id, conversation_id, role, content, model, context_files, created_at
      FROM public.ai_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 300
    `, [id]);
    return NextResponse.json({ conversations, conversation, messages, configured: Boolean(key), model });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureSchema();
    const body = (await request.json()) as {
      action?: unknown;
      conversationId?: unknown;
      content?: unknown;
      repository?: unknown;
      contextFiles?: ContextFileInput[];
      title?: unknown;
    };

    if (body.action === "new") {
      const repository = typeof body.repository === "string" && body.repository.trim()
        ? (await requireWorkspaceRepository(body.repository)).fullName
        : null;
      const title = typeof body.title === "string" ? cleanTitle(body.title) : "บทสนทนาใหม่";
      const { rows } = await queryNeon<ConversationRow>(`
        INSERT INTO public.ai_conversations (created_by, title, repository)
        VALUES ($1, $2, $3)
        RETURNING id, title, repository, created_at, updated_at
      `, [auth.context.userId, title, repository]);
      return NextResponse.json({ conversation: rows[0] }, { status: 201 });
    }

    if (body.action === "rename") {
      const id = typeof body.conversationId === "string" ? body.conversationId : "";
      const title = typeof body.title === "string" ? cleanTitle(body.title) : "";
      if (!UUID_RE.test(id) || !title) return NextResponse.json({ error: "ข้อมูลบทสนทนาไม่ถูกต้อง" }, { status: 400 });
      const { rows } = await queryNeon<ConversationRow>(`
        UPDATE public.ai_conversations SET title = $1, updated_at = NOW()
        WHERE id = $2 AND created_by = $3 AND archived_at IS NULL
        RETURNING id, title, repository, created_at, updated_at
      `, [title, id, auth.context.userId]);
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
      return NextResponse.json({ conversation: rows[0] });
    }

    if (body.action !== "message") return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "ข้อความต้องมีความยาว 1–8,000 ตัวอักษร" }, { status: 400 });
    }

    let conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    if (conversationId && !UUID_RE.test(conversationId)) {
      return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
    }
    const context = await loadContext(Array.isArray(body.contextFiles) ? body.contextFiles : []);
    const contextMetadata = context.map(({ repository, path, ref }) => ({ repository, path, ref }));

    if (!conversationId) {
      const repository = context[0]?.repository ?? null;
      const { rows } = await queryNeon<{ id: string }>(`
        INSERT INTO public.ai_conversations (created_by, title, repository)
        VALUES ($1, $2, $3) RETURNING id
      `, [auth.context.userId, cleanTitle(content), repository]);
      conversationId = rows[0].id;
    }

    const owned = await queryNeon<{ id: string }>(`
      SELECT id FROM public.ai_conversations
      WHERE id = $1 AND created_by = $2 AND archived_at IS NULL
    `, [conversationId, auth.context.userId]);
    if (!owned.rows[0]) return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });

    const history = await queryNeon<{ role: "user" | "assistant"; content: string }>(`
      SELECT role, content FROM public.ai_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC LIMIT 18
    `, [conversationId]);

    const contextBlock = context.length
      ? `\n\nบริบทไฟล์ที่ผู้ใช้เลือก:\n${context.map((file) =>
          `\n--- ${file.repository}/${file.path}${file.ref ? ` @ ${file.ref}` : ""} ---\n${file.content}`,
        ).join("\n")}`
      : "";
    const turns: AssistantTurn[] = [
      ...history.rows.reverse().map((row) => ({ role: row.role, content: row.content })),
      { role: "user", content: `${content}${contextBlock}` },
    ];

    const userMessage = await queryNeon<MessageRow>(`
      INSERT INTO public.ai_messages (conversation_id, role, content, context_files)
      VALUES ($1, 'user', $2, $3::jsonb)
      RETURNING id, conversation_id, role, content, model, context_files, created_at
    `, [conversationId, content, JSON.stringify(contextMetadata)]);

    const result = await createOpenAIResponse(turns, {
      instructions: assistantInstructions(auth.context.profile.display_name, auth.context.profile.role),
      maxOutputTokens: 4096,
    });

    const assistantMessage = await withNeonTransaction(async (client) => {
      const inserted = await client.query<MessageRow>(`
        INSERT INTO public.ai_messages (conversation_id, role, content, model)
        VALUES ($1, 'assistant', $2, $3)
        RETURNING id, conversation_id, role, content, model, context_files, created_at
      `, [conversationId, result.text, result.model]);
      await client.query(`
        UPDATE public.ai_conversations
        SET updated_at = NOW(),
            title = CASE WHEN title = 'บทสนทนาใหม่' THEN $2 ELSE title END,
            repository = COALESCE(repository, $3)
        WHERE id = $1
      `, [conversationId, cleanTitle(content), context[0]?.repository ?? null]);
      return inserted.rows[0];
    });

    return NextResponse.json({
      conversationId,
      messages: [userMessage.rows[0], assistantMessage],
      model: result.model,
      usage: result.usage,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireNeonEditor();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureSchema();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
    const result = await queryNeon(`
      UPDATE public.ai_conversations SET archived_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND created_by = $2 AND archived_at IS NULL
    `, [id, auth.context.userId]);
    if (!result.rowCount) return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
