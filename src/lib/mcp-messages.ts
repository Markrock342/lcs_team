import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import { insertChatMessageNotifications } from "@/lib/notification-chat";
export const sendMessageSchema = z.strictObject({
    channel_id: z.string().uuid(),
    message: z.string().trim().min(1).max(4000).refine((text) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text), "Invalid control characters"),
    idempotency_key: z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export class McpMessageError extends Error {
}
export function messagingEnabled(role: string, env: NodeJS.ProcessEnv = process.env) {
    return ["admin", "pm"].includes(role) && env.LCS_MCP_ENABLE_BOT_MESSAGING === "true";
}
export const ACTOR_CHANNEL_ACCESS = `(COALESCE(c.kind,'channel')<>'dm' OR c.created_by=$1 OR EXISTS (
  SELECT 1 FROM public.channel_members cm WHERE cm.channel_id=c.id AND cm.user_id=$1
))`;
type RequestRow = {
    id: string;
    actor_user_id: string;
    bot_user_id: string;
    channel_id: string;
    content: string;
    content_hash: string;
    idempotency_key: string;
    status: string;
    message_id: string | null;
    expired: boolean;
    expires_at: string;
    sent_at: string | null;
    approved_at: string | null;
};
async function checkActor(client: PoolClient, actorId: string) {
    const { rows } = await client.query(`SELECT id FROM public.profiles WHERE id=$1 AND role IN ('admin','pm') AND account_type='HUMAN' FOR SHARE`, [actorId]);
    if (!rows[0] || process.env.LCS_MCP_ENABLE_BOT_MESSAGING !== "true")
        throw new McpMessageError("ไม่มีสิทธิ์ส่งข้อความผ่านเลขาคิม หรือระบบยังไม่เปิดใช้");
}
async function checkedBot(client: PoolClient, actorId: string, channelId: string) {
    const { rows } = await client.query<{
        id: string;
    }>(`SELECT b.profile_id AS id FROM public.workspace_bots b
     JOIN public.profiles p ON p.id=b.profile_id
     JOIN public.workspace_bot_channels bc ON bc.bot_user_id=b.profile_id AND bc.channel_id=$2
     JOIN public.channel_members bm ON bm.user_id=b.profile_id AND bm.channel_id=bc.channel_id
     JOIN public.channels c ON c.id=bc.channel_id
     WHERE b.slug='secretary-kim' AND b.enabled AND p.account_type='BOT'
       AND p.username='secretary-kim' AND p.display_name='เลขาคิม' AND p.role='guest'
       AND ${ACTOR_CHANNEL_ACCESS} FOR SHARE OF b,p,bc,bm,c`, [actorId, channelId]);
    if (!rows[0])
        throw new McpMessageError("คุณหรือเลขาคิมยังไม่ได้รับสิทธิ์ส่งข้อความในห้องนี้");
    return rows[0].id;
}
async function audit(client: PoolClient, actorId: string, row: RequestRow, action: string, messageId?: string | null) {
    await client.query(`INSERT INTO public.mcp_audit_logs (user_id,tool_name,input_summary,actor_user_id,bot_user_id,channel_id,message_id,request_id)
    VALUES ($1,$2,$3::jsonb,$1,$4,$5,$6,$7)`, [actorId, action, JSON.stringify({ content_hash: row.content_hash, status: row.status }), row.bot_user_id, row.channel_id, messageId ?? row.message_id, row.id]);
}
/** First invocation prepares a request; only a separately approved request can send. */
export async function sendMcpMessage(actorId: string, raw: SendMessageInput) {
    const input = sendMessageSchema.parse(raw);
    const hash = createHash("sha256").update(JSON.stringify([input.channel_id, input.message])).digest("hex");
    const key = input.idempotency_key ?? `auto:${hash}`;
    return withNeonTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`mcp-message:${actorId}`]);
        await checkActor(client, actorId);
        const botId = await checkedBot(client, actorId, input.channel_id);
        let { rows } = await client.query<RequestRow>(`SELECT *, expires_at<=NOW() AS expired FROM public.mcp_message_requests WHERE actor_user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [actorId, key]);
        let row = rows[0];
        if (row && (row.content_hash !== hash || row.channel_id !== input.channel_id || row.bot_user_id !== botId || row.content !== input.message))
            throw new McpMessageError("idempotency_key นี้ใช้กับข้อความอื่นแล้ว กรุณาสร้างคำขอใหม่");
        if (row?.status === "sent")
            return { status: "sent" as const, replayed: true, message_id: row.message_id, channel_id: row.channel_id, sender: { id: botId, display_name: "เลขาคิม", account_type: "BOT" }, timestamp: row.sent_at, request_id: row.id };
        if (row && (row.expired || row.status === "denied"))
            throw new McpMessageError("คำขอหมดอายุหรือถูกปฏิเสธ กรุณาให้ผู้ใช้เริ่มคำขอใหม่ด้วย idempotency_key ใหม่");
        if (!row) {
            const count = await client.query<{
                count: number;
            }>(`SELECT count(*)::int AS count FROM public.mcp_message_requests WHERE actor_user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'`, [actorId]);
            if (count.rows[0].count >= 20)
                throw new McpMessageError("สร้างคำขอถี่เกินไป กรุณารอหนึ่งนาที");
            ({ rows } = await client.query<RequestRow>(`INSERT INTO public.mcp_message_requests (actor_user_id,bot_user_id,channel_id,idempotency_key,content,content_hash)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, false AS expired`, [actorId, botId, input.channel_id, key, input.message, hash]));
            row = rows[0];
            await audit(client, actorId, row, "prepare_message");
        }
        if (row.status !== "approved")
            return { status: "approval_required" as const, request_id: row.id, idempotency_key: key, channel_id: row.channel_id, message: row.content, expires_at: row.expires_at, approval_path: `/mcp/approve?request=${row.id}` };
        if (!row.approved_at)
            throw new McpMessageError("คำขอนี้ยังไม่มีหลักฐานการอนุมัติ");
        const counts = await client.query<{
            minute: number;
            day: number;
        }>(`SELECT count(*) FILTER (WHERE sent_at>NOW()-INTERVAL '1 minute')::int AS minute, count(*)::int AS day
      FROM public.mcp_message_requests WHERE actor_user_id=$1 AND status='sent' AND sent_at>NOW()-INTERVAL '24 hours'`, [actorId]);
        if (counts.rows[0].minute >= 5 || counts.rows[0].day >= 50)
            throw new McpMessageError("ถึงขีดจำกัดการส่ง (5 ครั้งต่อนาที / 50 ครั้งต่อ 24 ชั่วโมง)");
        const message = await client.query<{
            id: string;
            created_at: string;
        }>(`INSERT INTO public.messages (channel_id,sender_id,content,approved_by,bot_request_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id,created_at`, [row.channel_id, botId, row.content, actorId, row.id]);
        const sent = message.rows[0];
        await insertChatMessageNotifications(client, sent.id);
        await client.query(`UPDATE public.mcp_message_requests SET status='sent',message_id=$2,sent_at=$3 WHERE id=$1`, [row.id, sent.id, sent.created_at]);
        row.status = "sent";
        await audit(client, actorId, row, "send_message", sent.id);
        return { status: "sent" as const, replayed: false, message_id: sent.id, channel_id: row.channel_id, sender: { id: botId, display_name: "เลขาคิม", account_type: "BOT" }, timestamp: sent.created_at, request_id: row.id };
    });
}
export async function reviewMcpMessage(actorId: string, requestId: string, decision?: "approve" | "deny") {
    if (!z.string().uuid().safeParse(requestId).success)
        throw new McpMessageError("รหัสคำขอไม่ถูกต้อง");
    return withNeonTransaction(async (client) => {
        await checkActor(client, actorId);
        const { rows } = await client.query<RequestRow & {
            channel_name: string;
        }>(`SELECT r.*,r.expires_at<=NOW() AS expired,c.name AS channel_name
      FROM public.mcp_message_requests r JOIN public.channels c ON c.id=r.channel_id
      WHERE r.id=$2 AND r.actor_user_id=$1 FOR UPDATE OF r`, [actorId, requestId]);
        const row = rows[0];
        if (!row)
            throw new McpMessageError("ไม่พบคำขอของคุณ");
        await checkedBot(client, actorId, row.channel_id);
        if (decision) {
            if (row.expired || !["pending", "approved"].includes(row.status))
                throw new McpMessageError("คำขอนี้ไม่สามารถอนุมัติได้แล้ว");
            await client.query(`UPDATE public.mcp_message_requests SET status=$2,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END WHERE id=$1`, [row.id, decision === "approve" ? "approved" : "denied"]);
            await audit(client, actorId, row, decision === "approve" ? "approve_message" : "deny_message");
            row.status = decision === "approve" ? "approved" : "denied";
        }
        return { request_id: row.id, channel_id: row.channel_id, channel_name: row.channel_name, message: row.content, status: row.status, expired: row.expired, expires_at: row.expires_at, idempotency_key: row.idempotency_key, sender: "เลขาคิม" };
    });
}
export async function listMcpChannels(actorId: string, canSend: boolean) {
    const { rows } = await queryNeon(`SELECT c.id AS channel_id,
    CASE WHEN c.kind='dm' THEN COALESCE((SELECT string_agg(p.display_name,', ' ORDER BY p.display_name) FROM public.channel_members cm JOIN public.profiles p ON p.id=cm.user_id WHERE cm.channel_id=c.id AND p.id<>$1 AND to_jsonb(p)->>'account_type' IS DISTINCT FROM 'BOT'),c.name) ELSE c.name END AS channel_name,
    ARRAY(SELECT cm.user_id FROM public.channel_members cm WHERE cm.channel_id=c.id) AS member_ids,
    COALESCE(c.kind,'channel') AS channel_type,NULL::uuid AS project_id
    FROM public.channels c WHERE ${ACTOR_CHANNEL_ACCESS} ORDER BY c.name`, [actorId]);
    if (!canSend)
        return rows.map((row) => ({ ...row, can_send_message: false }));
    const grants = await queryNeon<{
        channel_id: string;
    }>(`SELECT bc.channel_id FROM public.workspace_bot_channels bc
    JOIN public.workspace_bots b ON b.profile_id=bc.bot_user_id AND b.slug='secretary-kim' AND b.enabled
    JOIN public.profiles p ON p.id=b.profile_id AND p.account_type='BOT'
    JOIN public.channel_members cm ON cm.channel_id=bc.channel_id AND cm.user_id=b.profile_id`);
    const allowed = new Set(grants.rows.map((row) => row.channel_id));
    return rows.map((row) => ({ ...row, can_send_message: allowed.has(String(row.channel_id)) }));
}
