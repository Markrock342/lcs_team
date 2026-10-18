import { createClient } from "@/lib/supabase/server";
import { queryNeon } from "@/lib/neon/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.auth.exchangeCodeForSession(code);
      const user = data.user;
      if (user) {
        const metadata = user.user_metadata ?? {};
        const base = String(metadata.username ?? user.email?.split("@")[0] ?? "member")
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, "-")
          .replace(/^-+|-+$/g, "") || "member";
        const username = `${base}-${user.id.slice(0, 6)}`;
        const displayName = String(metadata.display_name ?? metadata.full_name ?? metadata.name ?? base).slice(0, 200);
        await queryNeon(
          `INSERT INTO public.profiles (id,username,display_name,role,last_seen_at)
           VALUES ($1,$2,$3,'guest',NOW())
           ON CONFLICT (id) DO UPDATE SET last_seen_at=NOW()`,
          [user.id, username, displayName],
        );
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
