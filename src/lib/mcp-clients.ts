import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import { McpMessageError } from "@/lib/mcp-messages";
const text = (max: number) => z.string().trim().max(max);
const fields = { name: text(200).min(1), company: text(200).nullable().optional(), contact_name: text(200).nullable().optional(), contact_phone: text(100).nullable().optional(), contact_email: z.string().email().max(320).nullable().optional(), description: text(20000).nullable().optional(), notes: text(20000).nullable().optional(), budget: z.number().finite().min(0).max(999999999999).nullable().optional(), status: z.enum(["lead", "active", "completed", "paused"]).default("lead"), project_type: z.enum(["mobile_app", "web_app", "website", "system", "design", "maintenance", "consulting", "other"]).default("other") };
const key = z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_-]+$/).optional();
export const createClientSchema = z.strictObject({ ...fields, idempotency_key: key });
export const createProjectSchema = z.strictObject({ ...fields, client_id: z.string().uuid(), status: fields.status.default("active"), idempotency_key: key });
export const updateClientSchema = z.strictObject({ client_id: z.string().uuid(), changes: z.strictObject({ ...fields, status: z.enum(["lead", "active", "completed", "paused"]).optional(), project_type: z.enum(["mobile_app", "web_app", "website", "system", "design", "maintenance", "consulting", "other"]).optional() }).partial().refine(value => Object.keys(value).length > 0, "ต้องมีข้อมูลที่เปลี่ยน"), idempotency_key: key });
export const clientSchemas = { create_client: createClientSchema, update_client: updateClientSchema, create_project: createProjectSchema };
export type ClientTool = keyof typeof clientSchemas;
export function clientWritesEnabled(role: string, env: NodeJS.ProcessEnv = process.env) { return ["admin", "pm", "sale"].includes(role) && env.LCS_MCP_ENABLE_CLIENT_WRITES === "true"; }
const CLIENT_SELECT = `SELECT c.id,c.name,c.company,c.contact_name,c.contact_phone,c.contact_email,c.project_type,c.description,c.budget,c.notes,c.status,c.created_by,c.created_at,c.updated_at,extract(epoch FROM c.updated_at)::text AS updated_at_token,to_jsonb(c)->>'parent_client_id' AS parent_client_id FROM public.clients c`;
type BusinessRequest = {
    id: string;
    actor_user_id: string;
    tool_name: ClientTool;
    payload: Record<string, unknown>;
    payload_hash: string;
    idempotency_key: string;
    status: string;
    expired: boolean;
    expires_at: string;
    expected_updated_at: string | null;
    result: Record<string, unknown> | null;
    approved_at: string | null;
};
async function checkActor(client: PoolClient, actorId: string) { const actor = await client.query<{
    role: string;
}>(`SELECT role FROM public.profiles WHERE id=$1 AND role IN ('admin','pm','sale') AND account_type='HUMAN' FOR SHARE`, [actorId]); if (!actor.rows[0] || !clientWritesEnabled(actor.rows[0].role))
    throw new McpMessageError("ไม่มีสิทธิ์จัดการลูกค้าผ่าน MCP หรือเครื่องมือยังไม่เปิดใช้"); }
async function audit(client: PoolClient, actorId: string, row: BusinessRequest, action: string) { await client.query(`INSERT INTO public.mcp_audit_logs (user_id,tool_name,input_summary,actor_user_id,business_request_id) VALUES ($1,$2,$3::jsonb,$1,$4)`, [actorId, action, JSON.stringify({ payload_hash: row.payload_hash, request_id: row.id }), row.id]); }
export async function getMcpClientDetails(clientId: string) {
    const { rows } = await queryNeon(`${CLIENT_SELECT} WHERE c.id=$1`, [clientId]);
    if (!rows[0])
        throw new McpMessageError("ไม่พบลูกค้าหรือโครงการ");
    const projects = await queryNeon(`${CLIENT_SELECT} WHERE to_jsonb(c)->>'parent_client_id'=$1::text ORDER BY c.created_at DESC`, [clientId]);
    return { client: rows[0], projects: projects.rows };
}
export async function runMcpClientWrite(actorId: string, tool: ClientTool, raw: unknown) {
    const parsed = clientSchemas[tool].parse(raw);
    const { idempotency_key, ...payload } = parsed;
    const hash = createHash("sha256").update(JSON.stringify([tool, payload])).digest("hex");
    const requestKey = idempotency_key ?? `auto:${hash}`;
    return withNeonTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`mcp-business:${actorId}`]);
        await checkActor(client, actorId);
        let { rows } = await client.query<BusinessRequest>(`SELECT *,expires_at<=NOW() AS expired FROM public.mcp_business_requests WHERE actor_user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [actorId, requestKey]);
        let row = rows[0];
        if (row && (row.payload_hash !== hash || row.tool_name !== tool))
            throw new McpMessageError("idempotency_key นี้ผูกกับคำขออื่นแล้ว");
        if (row?.status === "completed")
            return { status: "completed" as const, replayed: true, request_id: row.id, result: row.result };
        if (row && (row.expired || row.status === "denied"))
            throw new McpMessageError("คำขอหมดอายุหรือถูกปฏิเสธ กรุณาเริ่มใหม่ด้วย key ใหม่");
        let target: Record<string, unknown> | undefined;
        if ("client_id" in payload) {
            const found = await client.query(`${CLIENT_SELECT} WHERE c.id=$1 FOR UPDATE`, [payload.client_id]);
            target = found.rows[0];
            if (!target)
                throw new McpMessageError("ไม่พบลูกค้าที่ระบุ");
            if (tool === "create_project" && target.parent_client_id)
                throw new McpMessageError("ต้องเลือกบัญชีลูกค้าหลัก ไม่ใช่โครงการย่อย");
        }
        if (!row) {
            const count = await client.query<{
                count: number;
            }>(`SELECT count(*)::int AS count FROM public.mcp_business_requests WHERE actor_user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'`, [actorId]);
            if (count.rows[0].count >= 20)
                throw new McpMessageError("สร้างคำขอถี่เกินไป กรุณารอสักครู่");
            ({ rows } = await client.query<BusinessRequest>(`INSERT INTO public.mcp_business_requests (actor_user_id,tool_name,idempotency_key,payload,payload_hash,expected_updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *,false AS expired`, [actorId, tool, requestKey, JSON.stringify(payload), hash, tool === "update_client" ? target?.updated_at_token : null]));
            row = rows[0];
            await audit(client, actorId, row, `prepare_${tool}`);
        }
        if (row.status !== "approved")
            return { status: "approval_required" as const, request_id: row.id, idempotency_key: requestKey, tool_name: tool, payload: row.payload, approval_path: `/mcp/approve?kind=client&request=${row.id}` };
        if (tool === "update_client" && String(target?.updated_at_token) !== row.expected_updated_at)
            throw new McpMessageError("ข้อมูลลูกค้าเปลี่ยนหลังเตรียมคำขอ กรุณาตรวจและอนุมัติคำขอใหม่");
        if (!row.approved_at)
            throw new McpMessageError("ยังไม่มีหลักฐานอนุมัติคำขอนี้");
        const counts = await client.query<{
            minute: number;
            day: number;
        }>(`SELECT count(*) FILTER(WHERE completed_at>NOW()-INTERVAL '1 minute')::int AS minute,count(*)::int AS day FROM public.mcp_business_requests WHERE actor_user_id=$1 AND status='completed' AND completed_at>NOW()-INTERVAL '24 hours'`, [actorId]);
        if (counts.rows[0].minute >= 10 || counts.rows[0].day >= 100)
            throw new McpMessageError("ถึงขีดจำกัดการแก้ข้อมูลลูกค้าผ่าน MCP");
        let result: Record<string, unknown>;
        if (tool === "update_client") {
            const changes = (payload as z.infer<typeof updateClientSchema>).changes;
            const entries = Object.entries(changes);
            const values = entries.map(([, value]) => value);
            values.push(String((payload as {
                client_id: string;
            }).client_id));
            const changed = await client.query(`UPDATE public.clients SET ${entries.map(([field], index) => `${field}=$${index + 1}`).join(",")},updated_at=clock_timestamp() WHERE id=$${values.length} RETURNING id,name,status,updated_at`, values);
            result = changed.rows[0];
        }
        else {
            const { client_id, ...data } = payload as Record<string, unknown>;
            const entries = Object.entries(data);
            const columns = entries.map(([field]) => field);
            const values = entries.map(([, value]) => value);
            columns.push("created_by", "parent_client_id");
            values.push(actorId, tool === "create_project" ? client_id : null);
            const created = await client.query(`INSERT INTO public.clients (${columns.join(",")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(",")}) RETURNING id,name,status,parent_client_id,created_at`, values);
            result = created.rows[0];
        }
        await client.query(`UPDATE public.mcp_business_requests SET status='completed',completed_at=NOW(),result=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(result)]);
        await audit(client, actorId, row, tool);
        return { status: "completed" as const, replayed: false, request_id: row.id, result };
    });
}
export async function reviewMcpClientWrite(actorId: string, requestId: string, decision?: "approve" | "deny") {
    if (!z.string().uuid().safeParse(requestId).success)
        throw new McpMessageError("รหัสคำขอไม่ถูกต้อง");
    return withNeonTransaction(async (client) => {
        await checkActor(client, actorId);
        const { rows } = await client.query<BusinessRequest>(`SELECT *,expires_at<=NOW() AS expired FROM public.mcp_business_requests WHERE id=$2 AND actor_user_id=$1 FOR UPDATE`, [actorId, requestId]);
        const row = rows[0];
        if (!row)
            throw new McpMessageError("ไม่พบคำขอของคุณ");
        if (decision) {
            if (row.expired || !["pending", "approved"].includes(row.status))
                throw new McpMessageError("คำขอนี้อนุมัติไม่ได้แล้ว");
            await client.query(`UPDATE public.mcp_business_requests SET status=$2,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END WHERE id=$1`, [row.id, decision === "approve" ? "approved" : "denied"]);
            await audit(client, actorId, row, `${decision}_${row.tool_name}`);
            row.status = decision === "approve" ? "approved" : "denied";
        }
        return { request_id: row.id, channel_name: row.tool_name, message: JSON.stringify(row.payload, null, 2), status: row.status, expired: row.expired, expires_at: row.expires_at };
    });
}
