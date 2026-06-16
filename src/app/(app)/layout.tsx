import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  let profile: Profile | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = data;
    }
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
