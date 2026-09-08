import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGeminiKey, generateGeminiText, streamGeminiText } from "@/lib/gemini";
import { canViewFinance } from "@/lib/permissions";
import {
  BRIEF_SYSTEM,
  DEFAULT_BRIEF_QUESTION,
  buildWorkspaceBriefPrompt,
} from "@/lib/workspace-brief";
import type { TeamRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTION = 800;

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

  if (!getGeminiKey()) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
  }

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim() || DEFAULT_BRIEF_QUESTION;
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: "คำถามยาวเกินไป" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const includeFinance = canViewFinance(profile?.role as TeamRole | undefined);
  const prompt = await buildWorkspaceBriefPrompt(supabase, question, {
    includeFinance,
    userId: user.id,
    asker: profile?.display_name ? `${profile.display_name} (${profile.role})` : undefined,
  });

  const geminiOptions = {
    system: BRIEF_SYSTEM,
    temperature: 0.35,
    maxOutputTokens: 4096,
  };

  const encoder = new TextEncoder();

  try {
    const iterator = streamGeminiText(prompt, geminiOptions)[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done || !first.value) {
      const text = await generateGeminiText(prompt, geminiOptions);
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(first.value));
          while (true) {
            const next = await iterator.next();
            if (next.done) break;
            controller.enqueue(encoder.encode(next.value));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "เรียก AI ไม่สำเร็จ";
          controller.enqueue(encoder.encode(`\n\nเกิดข้อผิดพลาด: ${message}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    try {
      const text = await generateGeminiText(prompt, geminiOptions);
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : "เรียก AI ไม่สำเร็จ",
        },
        { status: 500 }
      );
    }
  }
}
