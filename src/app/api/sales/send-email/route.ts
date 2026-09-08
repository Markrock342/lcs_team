import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/lib/permissions";
import { parseEmailDraft, sendSalesEmail } from "@/lib/sales-mail";
import type { TeamRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canEdit(profile?.role as TeamRole | undefined)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งเมล" }, { status: 403 });
  }

  const body = (await request.json()) as {
    to?: string;
    subject?: string;
    content?: string;
    prospectName?: string;
  };

  const to = body.to?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  if (!to || !content) {
    return NextResponse.json({ error: "ต้องมีอีเมลปลายทางและเนื้อหา" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "อีเมลปลายทางไม่ถูกต้อง" }, { status: 400 });
  }

  const fallback = body.prospectName
    ? `Limit Code Studio — ระบบจองคอร์ทสำหรับ ${body.prospectName}`
    : "Limit Code Studio";
  const parsed = parseEmailDraft(content, body.subject?.trim() || fallback);

  try {
    const sent = await sendSalesEmail({
      to,
      subject: parsed.subject,
      body: parsed.body,
    });
    return NextResponse.json({ ok: true, from: sent.from, subject: parsed.subject });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ส่งเมลไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
