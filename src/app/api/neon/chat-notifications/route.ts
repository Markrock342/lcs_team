import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { queryNeon } from "@/lib/neon/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request: Request) {
    try {
        const auth = await getNeonAuthContext();
        if (!auth.ok)
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        const { channelId, duration } = await request.json();
        if (typeof channelId !== "string" || !UUID_RE.test(channelId) || ![0, 15, 60, 480, 1440, "forever"].includes(duration)) {
            return NextResponse.json({ error: "กรุณาเลือกห้องและระยะเวลาปิดแจ้งเตือนที่ถูกต้อง" }, { status: 400 });
        }
        const { rows } = await queryNeon(`INSERT INTO public.chat_notification_preferences (user_id, channel_id, mute_forever, muted_until)
       SELECT $1, c.id, $3, CASE WHEN $4::int > 0 THEN NOW() + $4::int * INTERVAL '1 minute' ELSE NULL END
       FROM public.channels c WHERE c.id=$2 AND (
         COALESCE(c.kind, 'channel') <> 'dm' OR c.created_by=$1 OR EXISTS (
           SELECT 1 FROM public.channel_members cm WHERE cm.channel_id=c.id AND cm.user_id=$1
         )
       )
       ON CONFLICT (user_id, channel_id) DO UPDATE SET mute_forever=EXCLUDED.mute_forever, muted_until=EXCLUDED.muted_until
       RETURNING channel_id, mute_forever, muted_until`, [auth.context.userId, channelId, duration === "forever", typeof duration === "number" ? duration : 0]);
        if (!rows[0])
            return NextResponse.json({ error: "ไม่พบห้องหรือคุณไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
        return NextResponse.json({ preference: rows[0] });
    }
    catch (error) {
        console.error("[chat-notifications]", error);
        return NextResponse.json({ error: "บันทึกการปิดแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
    }
}
