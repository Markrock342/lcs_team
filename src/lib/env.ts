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
