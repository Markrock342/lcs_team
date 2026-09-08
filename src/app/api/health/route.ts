import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiKey } from "@/lib/gemini";
import { getSupabaseEnv } from "@/lib/env";
import { getVapidKeys } from "@/lib/push-server";

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

  const tables = [
    ["sales_deals", "ตารางดีลขาย", "รัน supabase/add-sales-department.sql"],
    ["sales_prospects", "ตารางรายชื่อเป้าหมาย", "รัน supabase/add-sales-productivity.sql"],
    ["sales_interactions", "ประวัติการติดต่อ", "รัน supabase/add-sales-productivity.sql"],
    ["saved_views", "มุมมองที่บันทึก", "รัน supabase/add-sales-productivity.sql"],
    ["notifications", "กล่องแจ้งเตือน", "รัน supabase/add-all-features.sql"],
    ["invoices", "ใบแจ้งหนี้", "รัน supabase/add-all-features.sql"],
  ] as const;

  for (const [table, label, fix] of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    checks.push({
      id: table,
      label,
      ok: !error,
      detail: error ? error.message : "ใช้งานได้",
      fix: error ? fix : undefined,
    });
  }

  const admin = createAdminClient();
  checks.push({
    id: "service-role",
    label: "Service role (push / cron)",
    ok: Boolean(admin),
    detail: admin ? "พร้อมส่งแจ้งเตือนเบื้องหลัง" : "ยังไม่มี SUPABASE_SERVICE_ROLE_KEY",
    fix: "ใส่ service role key ใน environment ของเซิร์ฟเวอร์เท่านั้น",
  });

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
