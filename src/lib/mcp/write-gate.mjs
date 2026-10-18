// Separate operator-controlled flags are both required: neither flag is inferred from user input.
export function canCreateTask(role, config) {
  return (role === "admin" || role === "pm") &&
    config?.enabled === "true" &&
    config?.roleGuardVerified === "true";
}
