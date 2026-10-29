export function pushErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "เบราว์เซอร์ไม่อนุญาต Push กรุณาอนุญาตการแจ้งเตือนให้เว็บนี้ในตั้งค่าเบราว์เซอร์และระบบ แล้วลองอีกครั้ง";
  if (name === "InvalidAccessError" || name === "InvalidCharacterError") return "คีย์ Push ของเว็บไม่ถูกต้อง กรุณาแจ้งแอดมินให้ตรวจการตั้งค่า VAPID";
  if (name === "InvalidStateError") return "ข้อมูล Push เดิมไม่ตรงกับเว็บเวอร์ชันนี้ กรุณารีเฟรชหน้าแล้วกดเปิดอีกครั้ง";
  if (name === "TimeoutError") return "บริการ Push ตอบกลับช้า กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง";
  if (name === "AbortError" || /push service|registration failed|push subscription/i.test(message)) return "เบราว์เซอร์เชื่อมต่อบริการ Push ไม่สำเร็จ ลองเปิดเว็บใหม่และตรวจว่าเครือข่ายหรือ VPN ไม่บล็อกบริการแจ้งเตือน หากยังไม่ได้ให้ลองเบราว์เซอร์อื่น";
  return "เปิด Push ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง";
}

export function pushKeysMatch(existing: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

export async function withPushTimeout<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DOMException("Push timed out", "TimeoutError")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
