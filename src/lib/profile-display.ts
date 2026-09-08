import { TEAM_ROLES, type Profile, type TeamRole } from "./types";

export function getProfileDisplayRoles(
  profile: Pick<Profile, "role" | "display_roles">
): TeamRole[] {
  if (profile.display_roles?.length) {
    const roles = profile.display_roles.filter((r): r is TeamRole =>
      (TEAM_ROLES as readonly string[]).includes(r)
    );
    if (roles.length > 0) return [...new Set(roles)];
  }
  return [profile.role];
}
