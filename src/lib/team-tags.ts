export const MAX_TEAM_TAGS = 10;
export const MAX_TEAM_TAG_LENGTH = 32;

export function validateTeamTags(value: unknown): { tags: string[]; error?: never } | { tags?: never; error: string } {
  if (!Array.isArray(value) || value.length > MAX_TEAM_TAGS) return { error: "เพิ่มป้ายได้สูงสุด 10 ป้ายต่อสมาชิก" };
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { error: "ชื่อป้ายต้องเป็นข้อความ" };
    const tag = item.normalize("NFC").trim().replace(/ +/g, " ");
    if (!tag || [...tag].length > MAX_TEAM_TAG_LENGTH || /[\u0000-\u001f\u007f]/.test(tag)) return { error: "ชื่อป้ายต้องมี 1–32 ตัวอักษรและอยู่ในบรรทัดเดียว" };
    if (!tags.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
  }
  return { tags };
}
