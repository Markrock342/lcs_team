import { reviewMcpClientWrite } from "@/lib/mcp-clients";
import { NextResponse } from "next/server";
import { getNeonAuthContext } from "@/lib/neon/auth";
import { McpMessageError, reviewMcpMessage } from "@/lib/mcp-messages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    const auth = await getNeonAuthContext();
    if (!auth.ok)
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    try {
        const url = new URL(request.url);
        const review = url.searchParams.get("kind") === "client" ? reviewMcpClientWrite : reviewMcpMessage;
        return NextResponse.json({ request: await review(auth.context.userId, url.searchParams.get("request") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof McpMessageError ? error.message : "โหลดคำขอไม่สำเร็จ" }, { status: 400 });
    }
}
export async function PATCH(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
        return NextResponse.json({ error: "คำขอต้องมาจากหน้าอนุมัติบนเว็บนี้" }, { status: 403 });
    const auth = await getNeonAuthContext();
    if (!auth.ok)
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    try {
        const body = await request.json();
        if (typeof body.request_id !== "string" || !["approve", "deny"].includes(body.decision))
            return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
        return NextResponse.json({ request: await (body.kind === "client" ? reviewMcpClientWrite : reviewMcpMessage)(auth.context.userId, body.request_id, body.decision) });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof McpMessageError ? error.message : "บันทึกการอนุมัติไม่สำเร็จ" }, { status: 400 });
    }
}
