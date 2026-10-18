import { AppShell } from "@/components/AppShell";
import { getNeonAuthContext } from "@/lib/neon/auth";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: Profile | null = null;
  const auth = await getNeonAuthContext();
  if (auth.ok) profile = auth.context.profile;

  return <AppShell profile={profile}>{children}</AppShell>;
}
