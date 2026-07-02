import type { Profile, TeamRole } from "./types";

export function getProfileDisplayRoles(
  profile: Pick<Profile, "role" | "display_roles">
): TeamRole[] {
  const valid: TeamRole[] = ["admin", "pm", "backend", "design", "guest"];
  if (profile.display_roles?.length) {
    const roles = profile.display_roles.filter((r): r is TeamRole =>
      valid.includes(r as TeamRole)
    );
    if (roles.length > 0) return [...new Set(roles)];
  }
  return [profile.role];
}
