export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key || url.includes("your-project") || key === "your-anon-key") {
    return null;
  }

  return { url, key };
}

export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}

/** URL หลักของแอพ — ใช้ในลิงก์ยืนยันอีเมล (ต้องตรงกับ Supabase Site URL) */
export function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

export function getAuthCallbackUrl() {
  return `${getSiteUrl()}/auth/callback`;
}
