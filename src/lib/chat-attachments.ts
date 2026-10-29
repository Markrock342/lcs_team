export const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

export function chatAttachmentError(files: readonly Pick<File, "name" | "size">[]): string | null {
  if (files.length > 1) return "แนบได้ครั้งละ 1 ไฟล์ กรุณาลากหรือเลือกทีละไฟล์";
  if (files[0]?.size > MAX_CHAT_FILE_BYTES) return "ไฟล์ใหญ่เกิน 50 MB กรุณาเลือกไฟล์ที่เล็กลง";
  return null;
}
