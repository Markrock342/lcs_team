import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateGeminiText } from "@/lib/gemini";
import { assistPrompt, type AssistMode } from "@/lib/sales-playbook";

const MODES: AssistMode[] = ["email", "call", "summary", "next_action"];

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

  const body = (await request.json()) as {
    mode?: AssistMode;
    context?: string;
    extra?: string;
  };

  if (!body.mode || !MODES.includes(body.mode) || !body.context?.trim()) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  try {
    const text = await generateGeminiText(
      assistPrompt(body.mode, body.context, body.extra),
      { maxOutputTokens: 8192 }
    );
    return NextResponse.json({ text, model: "gemini-3.7-flash" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "เรียก AI ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
