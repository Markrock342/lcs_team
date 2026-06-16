import type { AuthError } from "@supabase/supabase-js";

const ERROR_MAP: Record<string, string> = {
  "Database error saving new user":
    "ระบบฐานข้อมูลมีปัญหา — รันไฟล์ supabase/fix-signup.sql ใน Supabase SQL Editor",
  "User already registered": "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน",
  "Invalid login credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "Email not confirmed": "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
  "Signup requires a valid password":
    "รหัสผ่านไม่ถูกต้อง (อย่างน้อย 6 ตัวอักษร)",
};

export function getAuthErrorMessage(error: AuthError | null): string {
  if (!error) return "เกิดข้อผิดพลาด กรุณาลองใหม่";

  const raw =
    error.message ||
    (error as AuthError & { msg?: string }).msg ||
    error.code ||
    "";

  if (ERROR_MAP[raw]) return ERROR_MAP[raw];

  if (raw.includes("already registered") || raw.includes("already been registered")) {
    return ERROR_MAP["User already registered"];
  }

  if (raw.includes("Database error")) {
    return ERROR_MAP["Database error saving new user"];
  }

  return raw || "เกิดข้อผิดพลาด กรุณาลองใหม่";
}
