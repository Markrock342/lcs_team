import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGeminiKey } from "@/lib/gemini";
import { getSupabaseEnv } from "@/lib/env";
import { getVapidKeys } from "@/lib/push-server";
import { getNeonHealthSnapshot, isNeonConfigured, queryNeon } from "@/lib/neon/server";
import { getOpenAIConfig } from "@/lib/openai";

type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
};

export async function GET() {
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

  const checks: Check[] = [];
  const env = getSupabaseEnv();
  checks.push({
    id: "supabase-env",
    label: "Supabase environment",
    ok: Boolean(env),
    detail: env ? "พบ URL และ anon key" : "ยังไม่มี NEXT_PUBLIC_SUPABASE_URL / ANON_KEY",
    fix: "ใส่ค่าใน .env.local ของโปรเจกต์",
  });

  if (!isNeonConfigured()) {
    checks.push({
      id: "neon-env",
      label: "Neon PostgreSQL",
      ok: false,
      detail: "ยังไม่มี DATABASE_URL ฝั่ง server",
      fix: "ตั้ง DATABASE_URL ใน Vercel Production/Preview และ .env.local สำหรับ local",
    });
  } else {
    try {
      const snapshot = await getNeonHealthSnapshot();
      checks.push({
        id: "neon-env",
        label: "Neon PostgreSQL",
        ok: true,
        detail: `เชื่อมต่อได้ (${snapshot.tableCount} ตาราง, ${snapshot.tasks + snapshot.clients + snapshot.messages} แถวในชุดตรวจ)`,
      });
    } catch (error) {
      checks.push({
        id: "neon-env",
        label: "Neon PostgreSQL",
        ok: false,
        detail: error instanceof Error ? error.message : "เชื่อมต่อ Neon ไม่สำเร็จ",
        fix: "ตรวจ DATABASE_URL และสิทธิ์ของ role ใน Neon",
      });
    }
  }

  const tables = [
    ["sales_deals", "ตารางดีลขาย", "รัน supabase/add-sales-department.sql"],
    ["sales_prospects", "ตารางรายชื่อเป้าหมาย", "รัน supabase/add-sales-productivity.sql"],
    ["sales_interactions", "ประวัติการติดต่อ", "รัน supabase/add-sales-productivity.sql"],
    ["saved_views", "มุมมองที่บันทึก", "ตรวจ schema ใน Neon"],
    ["notifications", "กล่องแจ้งเตือน", "ตรวจ schema ใน Neon"],
    ["invoices", "ใบแจ้งหนี้", "ตรวจ schema ใน Neon"],
    ["profiles", "ข้อมูลสมาชิก", "ตรวจ schema ใน Neon"],
    ["time_entries", "เวลาทำงาน", "ตรวจ schema ใน Neon"],
    ["task_templates", "เทมเพลตงาน", "ตรวจ schema ใน Neon"],
    ["push_subscriptions", "Push subscriptions", "ตรวจ schema ใน Neon"],
    ["ai_conversations", "ประวัติ LCS Assistant", "รัน scripts/neon-team-engineering-workspace.sql บน Neon"],
    ["ai_messages", "ข้อความ LCS Assistant", "รัน scripts/neon-team-engineering-workspace.sql บน Neon"],
    ["mcp_audit_logs", "ChatGPT connector audit log", "รัน scripts/neon-team-engineering-workspace.sql บน Neon"],
  ] as const;

  for (const [table, label, fix] of tables) {
    let error: string | null = null;
    try {
      await queryNeon(`SELECT id FROM public.${table} LIMIT 1`);
    } catch (tableError) {
      error = tableError instanceof Error ? tableError.message : "ตรวจตารางไม่สำเร็จ";
    }
    checks.push({
      id: table,
      label,
      ok: !error,
      detail: error ?? "ใช้งานได้บน Neon",
      fix: error ? fix : undefined,
    });
  }

  const vapid = getVapidKeys();
  checks.push({
    id: "vapid",
    label: "Push notification keys",
    ok: Boolean(vapid),
    detail: vapid ? "พบ VAPID keys" : "ยังไม่มี VAPID public/private key",
    fix: "รัน scripts/generate-vapid.js แล้วใส่ค่าใน env",
  });

  checks.push({
    id: "gemini",
    label: "Gemini API",
    ok: Boolean(getGeminiKey()),
    detail: getGeminiKey() ? "พบ GEMINI_API_KEY" : "ยังไม่มีคีย์ Google AI Studio",
    fix: "ใส่ GEMINI_API_KEY ใน environment ของเซิร์ฟเวอร์ อย่าใส่ใน NEXT_PUBLIC_",
  });

  const openai = getOpenAIConfig();
  checks.push({
    id: "openai",
    label: "LCS Assistant (OpenAI)",
    ok: Boolean(openai.key),
    detail: openai.key ? `พร้อมใช้โมเดล ${openai.model}` : "ยังไม่มี OPENAI_API_KEY",
    fix: "ใส่ OPENAI_API_KEY ใน environment ของเซิร์ฟเวอร์ อย่าใส่ใน NEXT_PUBLIC_",
  });

  const githubReadToken = process.env.GITHUB_READ_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  checks.push({
    id: "github-code",
    label: "GitHub Code Workspace",
    ok: Boolean(githubReadToken),
    detail: githubReadToken ? "พบ token สำหรับอ่าน repository" : "ยังไม่มี GitHub read token (public repository ยังเปิดได้)",
    fix: "สร้าง fine-grained token เฉพาะ repository โดยให้ Contents: Read-only แล้วตั้ง GITHUB_READ_TOKEN",
  });

  const gmail = Boolean(
    (process.env.SALES_GMAIL_USER?.trim() || process.env.SALES_SMTP_USER?.trim()) &&
      (process.env.SALES_GMAIL_APP_PASSWORD?.trim() || process.env.SALES_SMTP_PASS?.trim())
  );
  checks.push({
    id: "sales-gmail",
    label: "เมลทีมขาย",
    ok: gmail,
    detail: gmail ? "พร้อมส่งจากเมลทีมหลังกดยืนยัน" : "ยังไม่มี SALES_GMAIL_USER / SALES_GMAIL_APP_PASSWORD",
    fix: "สร้างรหัสผ่านแอปของ Gmail แล้วใส่ใน Vercel — อย่าใส่รหัสเข้าจีเมลปกติ และอย่าใส่ในโค้ด",
  });

  checks.push({
    id: "cron",
    label: "Cron secret",
    ok: Boolean(process.env.CRON_SECRET?.trim() || process.env.NOTIFICATION_DISPATCH_SECRET?.trim()),
    detail: "ใช้เรียก /api/cron/reminders",
    fix: "ตั้ง CRON_SECRET ให้ตรงกับ Authorization header",
  });

  if (env) {
    const { error } = await supabase.storage.from("uploads").list("", { limit: 1 });
    checks.push({
      id: "storage",
      label: "Storage bucket uploads",
      ok: !error,
      detail: error ? error.message : "bucket uploads พร้อมใช้",
      fix: "รัน supabase/storage-uploads.sql",
    });
  }

  return NextResponse.json({
    ok: checks.every((item) => item.ok),
    checks,
  });
}
