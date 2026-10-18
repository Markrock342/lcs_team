import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
let typingSchemaPromise: Promise<void> | null = null;

const ACCESS_SQL = `(COALESCE(c.kind, 'channel') <> 'dm' OR c.created_by = $1 OR EXISTS (
  SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1
))`;

const MESSAGE_SELECT = `SELECT m.*,
  CASE WHEN sender.id IS NULL THEN NULL ELSE to_jsonb(sender) END AS sender,
  CASE WHEN reply.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', reply.id, 'content', reply.content, 'sender_id', reply.sender_id,
    'deleted_at', reply.deleted_at, 'file_name', reply.file_name,
    'sender', CASE WHEN reply_sender.id IS NULL THEN NULL ELSE jsonb_build_object('display_name', reply_sender.display_name) END
  ) END AS reply_to,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'user_id', mr.user_id, 'read_at', mr.read_at,
    'reader', jsonb_build_object('id', rp.id, 'display_name', rp.display_name, 'username', rp.username)
  )) FROM public.message_reads mr LEFT JOIN public.profiles rp ON rp.id = mr.user_id WHERE mr.message_id = m.id), '[]'::jsonb) AS reads,
  COALESCE((SELECT jsonb_agg(to_jsonb(rx) || jsonb_build_object(
    'user', jsonb_build_object('id', ux.id, 'display_name', ux.display_name)
  )) FROM public.message_reactions rx LEFT JOIN public.profiles ux ON ux.id = rx.user_id WHERE rx.message_id = m.id), '[]'::jsonb) AS reactions
  FROM public.messages m
  JOIN public.channels c ON c.id = m.channel_id
  LEFT JOIN public.profiles sender ON sender.id = m.sender_id
  LEFT JOIN public.messages reply ON reply.id = m.reply_to_id
  LEFT JOIN public.profiles reply_sender ON reply_sender.id = reply.sender_id`;

function fail(error: unknown) {
  console.error("[neon/chat]", error);
  return NextResponse.json({ error: "จัดการข้อมูลแชทไม่สำเร็จ" }, { status: 500 });
}

function uuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

async function ensureTypingSchema() {
  if (!typingSchemaPromise) {
    typingSchemaPromise = (async () => {
      await queryNeon(`
        CREATE TABLE IF NOT EXISTS public.chat_typing (
          channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (channel_id, user_id)
        )
      `);
      await queryNeon(
        `CREATE INDEX IF NOT EXISTS idx_chat_typing_updated ON public.chat_typing(updated_at)`,
      );
    })().catch((error) => {
      typingSchemaPromise = null;
      throw error;
    });
  }
  await typingSchemaPromise;
}

export async function GET(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "channels";
    const userId = auth.context.userId;

    if (mode === "channels") {
      const { rows } = await queryNeon(
        `SELECT c.* FROM public.channels c WHERE ${ACCESS_SQL} ORDER BY c.created_at`,
        [userId]
      );
      return NextResponse.json({ channels: rows });
    }
    if (mode === "messages") {
      const channelId = uuid(url.searchParams.get("channelId"));
      if (!channelId) return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      const threadId = uuid(url.searchParams.get("threadId"));
      const threadClause = threadId ? `AND (m.id = $3 OR m.thread_id = $3)` : `AND m.thread_id IS NULL`;
      const { rows } = await queryNeon(
        `${MESSAGE_SELECT} WHERE m.channel_id = $2 AND ${ACCESS_SQL} ${threadClause}
         ORDER BY m.created_at ASC LIMIT 200`,
        threadId ? [userId, channelId, threadId] : [userId, channelId]
      );
      return NextResponse.json({ messages: rows });
    }
    if (mode === "message") {
      const id = uuid(url.searchParams.get("id"));
      if (!id) return NextResponse.json({ error: "รหัสข้อความไม่ถูกต้อง" }, { status: 400 });
      const { rows } = await queryNeon(`${MESSAGE_SELECT} WHERE m.id = $2 AND ${ACCESS_SQL} LIMIT 1`, [userId, id]);
      return NextResponse.json({ message: rows[0] ?? null });
    }
    if (mode === "thread-counts") {
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => UUID_RE.test(id));
      if (!ids.length) return NextResponse.json({ counts: {} });
      const { rows } = await queryNeon<{ thread_id: string; count: number }>(
        `SELECT m.thread_id, count(*)::int AS count
         FROM public.messages m JOIN public.channels c ON c.id = m.channel_id
         WHERE m.thread_id = ANY($2::uuid[]) AND m.deleted_at IS NULL AND ${ACCESS_SQL}
         GROUP BY m.thread_id`,
        [userId, ids]
      );
      return NextResponse.json({ counts: Object.fromEntries(rows.map((row) => [row.thread_id, row.count])) });
    }
    if (mode === "unread") {
      const { rows } = await queryNeon<{ channel_id: string; count: number }>(
        `SELECT c.id AS channel_id, count(m.id)::int AS count
         FROM public.channels c
         LEFT JOIN public.channel_reads cr ON cr.channel_id = c.id AND cr.user_id = $1
         LEFT JOIN public.messages m ON m.channel_id = c.id AND m.sender_id <> $1
           AND m.deleted_at IS NULL AND m.thread_id IS NULL
           AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
         WHERE ${ACCESS_SQL}
         GROUP BY c.id`,
        [userId]
      );
      return NextResponse.json({ counts: Object.fromEntries(rows.map((row) => [row.channel_id, row.count])) });
    }
    if (mode === "search") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q) return NextResponse.json({ messages: [] });
      const { rows } = await queryNeon(
        `SELECT m.id, m.content, m.channel_id,
          jsonb_build_object('name', c.name, 'kind', c.kind) AS channels
         FROM public.messages m JOIN public.channels c ON c.id = m.channel_id
         WHERE m.deleted_at IS NULL AND m.content ILIKE $2 AND ${ACCESS_SQL}
         ORDER BY m.created_at DESC LIMIT 6`,
        [userId, `%${q}%`]
      );
      return NextResponse.json({ messages: rows });
    }
    if (mode === "typing") {
      const channelId = uuid(url.searchParams.get("channelId"));
      if (!channelId) return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      await ensureTypingSchema();
      const { rows } = await queryNeon(
        `SELECT p.id, p.display_name
         FROM public.chat_typing ct
         JOIN public.profiles p ON p.id = ct.user_id
         JOIN public.channels c ON c.id = ct.channel_id
         WHERE ct.channel_id = $2 AND ct.user_id <> $1
           AND ct.updated_at >= NOW() - INTERVAL '8 seconds' AND ${ACCESS_SQL}
         ORDER BY p.display_name`,
        [userId, channelId],
      );
      return NextResponse.json({ users: rows });
    }
    return NextResponse.json({ error: "โหมดไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { action?: unknown; data?: Row };
    const data = body.data ?? {};
    const userId = auth.context.userId;

    if (body.action === "typing" || body.action === "stop-typing") {
      const channelId = uuid(data.channel_id);
      if (!channelId) return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      await ensureTypingSchema();
      const access = await queryNeon<{ ok: boolean }>(
        `SELECT TRUE AS ok FROM public.channels c WHERE c.id = $2 AND ${ACCESS_SQL}`,
        [userId, channelId],
      );
      if (!access.rows[0]) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าช่องนี้" }, { status: 403 });
      if (body.action === "stop-typing") {
        await queryNeon(`DELETE FROM public.chat_typing WHERE channel_id=$1 AND user_id=$2`, [channelId, userId]);
      } else {
        await queryNeon(
          `INSERT INTO public.chat_typing (channel_id,user_id,updated_at) VALUES ($1,$2,NOW())
           ON CONFLICT (channel_id,user_id) DO UPDATE SET updated_at=NOW()`,
          [channelId, userId],
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "message") {
      const channelId = uuid(data.channel_id);
      if (!channelId) return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      const access = await queryNeon<{ ok: boolean }>(
        `SELECT TRUE AS ok FROM public.channels c WHERE c.id = $2 AND ${ACCESS_SQL}`,
        [userId, channelId]
      );
      if (!access.rows[0]) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าช่องนี้" }, { status: 403 });
      const { rows } = await queryNeon<{ id: string }>(
        `INSERT INTO public.messages
         (channel_id, sender_id, content, file_url, file_name, file_type, mentioned_ids, reply_to_id, thread_id, linked_task_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9,$10) RETURNING id`,
        [channelId, userId, data.content ?? null, data.file_url ?? null, data.file_name ?? null,
          data.file_type ?? null, Array.isArray(data.mentioned_ids) ? data.mentioned_ids : [],
          data.reply_to_id ?? null, data.thread_id ?? null, data.linked_task_id ?? null]
      );
      const inserted = await queryNeon(`${MESSAGE_SELECT} WHERE m.id = $2 AND ${ACCESS_SQL} LIMIT 1`, [userId, rows[0].id]);
      return NextResponse.json({ message: inserted.rows[0] }, { status: 201 });
    }
    if (body.action === "channel") {
      if (auth.context.profile.role === "guest") {
        return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างช่องสนทนา" }, { status: 403 });
      }
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name || name.length > 100) return NextResponse.json({ error: "ชื่อช่องไม่ถูกต้อง" }, { status: 400 });
      const { rows } = await queryNeon(
        `INSERT INTO public.channels (name, description, kind, created_by)
         VALUES ($1,$2,'channel',$3) RETURNING *`,
        [name, data.description ?? null, userId]
      );
      return NextResponse.json({ channel: rows[0] }, { status: 201 });
    }
    if (body.action === "dm") {
      const otherId = uuid(data.other_user_id);
      if (!otherId || otherId === userId) return NextResponse.json({ error: "ผู้รับไม่ถูกต้อง" }, { status: 400 });
      const dmKey = [userId, otherId].sort().join(":");
      const channel = await withNeonTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO public.channels (name, description, kind, dm_key, created_by)
           VALUES ($1,'ข้อความส่วนตัว','dm',$2,$3)
           ON CONFLICT (dm_key) WHERE dm_key IS NOT NULL DO UPDATE SET dm_key=EXCLUDED.dm_key
           RETURNING *`,
          [`dm:${dmKey}`, dmKey, userId]
        );
        await client.query(
          `INSERT INTO public.channel_members (channel_id, user_id) VALUES ($1,$2),($1,$3)
           ON CONFLICT DO NOTHING`,
          [result.rows[0].id, userId, otherId]
        );
        return result.rows[0];
      });
      return NextResponse.json({ channel }, { status: 201 });
    }
    if (body.action === "read-channel") {
      const channelId = uuid(data.channel_id);
      if (!channelId) return NextResponse.json({ error: "รหัสช่องไม่ถูกต้อง" }, { status: 400 });
      await queryNeon(
        `INSERT INTO public.channel_reads (channel_id, user_id, last_read_at)
         SELECT c.id, $1, NOW() FROM public.channels c WHERE c.id = $2 AND ${ACCESS_SQL}
         ON CONFLICT (channel_id,user_id) DO UPDATE SET last_read_at=NOW()`,
        [userId, channelId]
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === "read-messages") {
      const ids = Array.isArray(data.ids) ? data.ids.filter((id) => typeof id === "string" && UUID_RE.test(id)) : [];
      if (ids.length) await queryNeon(
        `INSERT INTO public.message_reads (message_id, user_id)
         SELECT m.id, $1 FROM public.messages m
         JOIN public.channels c ON c.id = m.channel_id
         WHERE m.id = ANY($2::uuid[]) AND ${ACCESS_SQL}
         ON CONFLICT (message_id,user_id) DO UPDATE SET read_at=NOW()`,
        [userId, ids]
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reaction") {
      const messageId = uuid(data.message_id);
      const emoji = typeof data.emoji === "string" ? data.emoji.slice(0, 32) : "";
      if (!messageId || !emoji) return NextResponse.json({ error: "ข้อมูลรีแอคไม่ถูกต้อง" }, { status: 400 });
      const { rows } = await queryNeon(
        `INSERT INTO public.message_reactions (message_id,user_id,emoji)
         SELECT m.id, $1, $3 FROM public.messages m
         JOIN public.channels c ON c.id = m.channel_id
         WHERE m.id = $2 AND ${ACCESS_SQL}
         ON CONFLICT (message_id,user_id,emoji) DO UPDATE SET emoji=EXCLUDED.emoji
         RETURNING *, jsonb_build_object('id',$1::uuid,'display_name',$4::text) AS "user"`,
        [userId, messageId, emoji, auth.context.profile.display_name]
      );
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบข้อความหรือไม่มีสิทธิ์" }, { status: 404 });
      return NextResponse.json({ reaction: rows[0] }, { status: 201 });
    }
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { target?: unknown; id?: unknown; data?: Row };
    const id = uuid(body.id);
    if (!id || !body.data) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    if (body.target === "channel") {
      if (auth.context.profile.role === "guest") {
        return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขช่องสนทนา" }, { status: 403 });
      }
      const name = typeof body.data.name === "string" ? body.data.name.trim() : "";
      const { rows } = await queryNeon(
        `UPDATE public.channels SET name=$1, description=$2 WHERE id=$3 RETURNING *`,
        [name, body.data.description ?? null, id]
      );
      return NextResponse.json({ channel: rows[0] ?? null });
    }
    if (body.target === "message") {
      const role = auth.context.profile.role;
      const owns = role === "admin" ? "" : `AND sender_id = $8`;
      const { rows } = await queryNeon(
        `UPDATE public.messages SET
         content=COALESCE($1,content), edited_at=COALESCE($2,edited_at),
         deleted_at=COALESCE($3,deleted_at),
         pinned_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE pinned_at END,
         pinned_by=CASE WHEN $5::boolean THEN $7::uuid ELSE pinned_by END
         WHERE id=$4 ${owns} RETURNING *`,
        [body.data.content ?? null, body.data.edited_at ?? null, body.data.deleted_at ?? null,
          id, Object.prototype.hasOwnProperty.call(body.data, "pinned_at"), body.data.pinned_at ?? null,
          body.data.pinned_by ?? null, ...(role === "admin" ? [] : [auth.context.userId])]
      );
      if (!rows[0]) return NextResponse.json({ error: "ไม่พบข้อความหรือไม่มีสิทธิ์" }, { status: 404 });
      return NextResponse.json({ message: rows[0] });
    }
    return NextResponse.json({ error: "ประเภทข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getNeonAuthContext();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json()) as { target?: unknown; id?: unknown };
    const id = uuid(body.id);
    if (!id) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
    if (body.target === "channel") {
      if (auth.context.profile.role === "guest") {
        return NextResponse.json({ error: "ไม่มีสิทธิ์ลบช่องสนทนา" }, { status: 403 });
      }
      await queryNeon(`DELETE FROM public.channels WHERE id=$1 AND name <> 'general'`, [id]);
      return NextResponse.json({ ok: true });
    }
    if (body.target === "reaction") {
      await queryNeon(`DELETE FROM public.message_reactions WHERE id=$1 AND user_id=$2`, [id, auth.context.userId]);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "ประเภทข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
