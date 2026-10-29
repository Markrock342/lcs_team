import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon, withNeonTransaction } from "@/lib/neon/server";
import { ACTOR_CHANNEL_ACCESS } from "@/lib/mcp-messages";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function authenticate() { const auth = await getNeonAuthContext(); if (!auth.ok)
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) }; if (auth.context.profile.role !== "admin")
    return { error: NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 }) }; return { userId: auth.context.userId }; }
export async function GET() {
    const auth = await authenticate();
    if (auth.error)
        return auth.error;
    if (process.env.LCS_MCP_ENABLE_BOT_MESSAGING !== "true")
        return NextResponse.json({ configured: false });
    try {
        const [bot, channels] = await Promise.all([
            queryNeon(`SELECT p.id,p.display_name,p.account_type,b.enabled FROM public.workspace_bots b JOIN public.profiles p ON p.id=b.profile_id WHERE b.slug='secretary-kim'`),
            queryNeon(`SELECT c.id,CASE WHEN c.kind='dm' THEN COALESCE((SELECT string_agg(p.display_name,', ' ORDER BY p.display_name) FROM public.channel_members cm JOIN public.profiles p ON p.id=cm.user_id WHERE cm.channel_id=c.id AND p.id<>$1 AND p.account_type<>'BOT'),c.name) ELSE c.name END AS name,c.kind,EXISTS(SELECT 1 FROM public.workspace_bot_channels bc JOIN public.workspace_bots b ON b.profile_id=bc.bot_user_id WHERE bc.channel_id=c.id AND b.slug='secretary-kim') AS allowed
   FROM public.channels c WHERE ${ACTOR_CHANNEL_ACCESS} ORDER BY c.kind,c.name`, [auth.userId])
        ]);
        return NextResponse.json({ configured: true, bot: bot.rows[0] ?? null, channels: channels.rows }, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch {
        return NextResponse.json({ error: "ยังไม่ได้เตรียมบัญชีเลขาคิมหรือฐานข้อมูล" }, { status: 503 });
    }
}
const change = z.union([z.strictObject({ enabled: z.boolean() }), z.strictObject({ channel_id: z.string().uuid(), allowed: z.boolean() })]);
export async function PATCH(request: Request) {
    const auth = await authenticate();
    if (auth.error)
        return auth.error;
    if (request.headers.get("origin") !== new URL(request.url).origin)
        return NextResponse.json({ error: "คำขอต้องมาจากเว็บนี้" }, { status: 403 });
    if (process.env.LCS_MCP_ENABLE_BOT_MESSAGING !== "true")
        return NextResponse.json({ error: "ยังไม่เปิดใช้เลขาคิม" }, { status: 403 });
    try {
        const parsed = change.safeParse(await request.json());
        if (!parsed.success)
            return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
        const input = parsed.data;
        await withNeonTransaction(async (client) => {
            const actor = await client.query(`SELECT id FROM public.profiles WHERE id=$1 AND role='admin' AND account_type='HUMAN' FOR SHARE`, [auth.userId]);
            if (!actor.rows[0])
                throw new Error("role changed");
            const bot = await client.query<{
                id: string;
            }>(`SELECT p.id FROM public.workspace_bots b JOIN public.profiles p ON p.id=b.profile_id WHERE b.slug='secretary-kim' AND p.account_type='BOT' AND p.username='secretary-kim' FOR UPDATE OF b`, []);
            if (!bot.rows[0])
                throw new Error("bot not found");
            const botId = bot.rows[0].id;
            if ("enabled" in input)
                await client.query(`UPDATE public.workspace_bots SET enabled=$1 WHERE slug='secretary-kim'`, [input.enabled]);
            else {
                const access = await client.query(`SELECT c.id FROM public.channels c WHERE c.id=$2 AND ${ACTOR_CHANNEL_ACCESS} FOR SHARE OF c`, [auth.userId, input.channel_id]);
                if (!access.rows[0])
                    throw new Error("no channel access");
                if (input.allowed) {
                    await client.query(`INSERT INTO public.workspace_bot_channels (bot_user_id,channel_id,granted_by) VALUES ($1,$2,$3) ON CONFLICT(bot_user_id,channel_id) DO NOTHING`, [botId, input.channel_id, auth.userId]);
                    await client.query(`INSERT INTO public.channel_members (channel_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [input.channel_id, botId]);
                }
                else {
                    await client.query(`DELETE FROM public.workspace_bot_channels WHERE bot_user_id=$1 AND channel_id=$2`, [botId, input.channel_id]);
                    await client.query(`DELETE FROM public.channel_members WHERE user_id=$1 AND channel_id=$2`, [botId, input.channel_id]);
                }
            }
            await client.query(`INSERT INTO public.mcp_audit_logs (user_id,tool_name,input_summary,actor_user_id,bot_user_id,channel_id) VALUES ($1,'configure_bot',$2::jsonb,$1,$3,$4)`, [auth.userId, JSON.stringify(input), botId, "channel_id" in input ? input.channel_id : null]);
        });
        return NextResponse.json({ ok: true });
    }
    catch {
        return NextResponse.json({ error: "บันทึกสิทธิ์เลขาคิมไม่สำเร็จ ตรวจสิทธิ์แอดมินและห้องที่เลือก" }, { status: 400 });
    }
}
