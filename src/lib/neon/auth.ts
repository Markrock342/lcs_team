import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Permission } from "@/lib/permissions";
import { queryNeon } from "@/lib/neon/server";
import type { Profile } from "@/lib/types";

type NeonAuthContext = {
  userId: string;
  profile: Profile;
};

export async function getNeonAuthContext(): Promise<
  { ok: true; context: NeonAuthContext } | { ok: false; status: 401 | 403 | 503; error: string }
> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, status: 503, error: "ยังไม่ได้ตั้งค่า Supabase" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { rows } = await queryNeon<Profile>(
    `SELECT * FROM public.profiles WHERE id = $1 LIMIT 1`,
    [user.id]
  );
  const profile = rows[0];
  if (!profile) {
    return { ok: false, status: 403, error: "ไม่พบโปรไฟล์สมาชิกใน Neon" };
  }

  if (profile.account_type === "BOT") return { ok: false, status: 403, error: "บัญชี Bot ไม่สามารถเข้าสู่ระบบแบบสมาชิกได้" };
  return { ok: true, context: { userId: user.id, profile } };
}

export async function requireNeonPermission(permission: Permission) {
  const result = await getNeonAuthContext();
  if (!result.ok) return result;
  if (!hasPermission(result.context.profile.role, permission)) {
    return { ok: false as const, status: 403 as const, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return result;
}

export async function requireNeonEditor() {
  const result = await getNeonAuthContext();
  if (!result.ok) return result;
  if (result.context.profile.role === "guest") {
    return { ok: false as const, status: 403 as const, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return result;
}
