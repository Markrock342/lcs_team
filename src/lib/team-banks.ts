/** บัญชีทีมเริ่มต้น — ใช้เติมถ้า profile ยังไม่ได้ตั้งใน DB */
export const DEFAULT_TEAM_BANKS: Record<
  string,
  { bank_name: string; bank_account_number: string; bank_account_name: string }
> = {
  bank: {
    bank_name: "กสิกรไทย",
    bank_account_number: "0718161010",
    bank_account_name: "วงศธร ศรีสถาน",
  },
  knott: {
    bank_name: "กสิกรไทย",
    bank_account_number: "1158754378",
    bank_account_name: "สนธยา สายวรรณะ",
  },
};

export function mergeProfileBank<T extends {
  username: string;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
}>(profile: T): T {
  const key = profile.username.toLowerCase().replace(/_.*$/, "");
  const defaults = DEFAULT_TEAM_BANKS[key];
  if (!defaults) return profile;
  if (
    profile.bank_name &&
    profile.bank_account_number &&
    profile.bank_account_name
  ) {
    return profile;
  }
  return {
    ...profile,
    bank_name: profile.bank_name || defaults.bank_name,
    bank_account_number:
      profile.bank_account_number || defaults.bank_account_number,
    bank_account_name:
      profile.bank_account_name || defaults.bank_account_name,
  };
}

export function hasBankInfo(p: {
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
}) {
  return !!(p.bank_name && p.bank_account_number && p.bank_account_name);
}
