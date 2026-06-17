const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

function twoDigits(n: number): string {
  if (n === 0) return "";
  if (n === 1) return "สิบ";
  if (n === 2) return "ยี่สิบ";
  if (n < 10) return DIGIT[n] + "สิบ";
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 1 ? "สิบ" : tens === 2 ? "ยี่สิบ" : DIGIT[tens] + "สิบ";
  if (ones === 0) return head;
  if (ones === 1) return head + "เอ็ด";
  return head + DIGIT[ones];
}

function threeDigits(n: number): string {
  if (n === 0) return "";
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundred > 0 ? DIGIT[hundred] + "ร้อย" : "";
  const tail = twoDigits(rest);
  if (head && !tail) return head;
  return head + tail;
}

/** แปลงจำนวนเต็มบาทเป็นตัวอักษรไทย (ไม่รวมสตางค์) */
export function bahtToText(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return "ศูนย์บาทถ้วน";

  const parts: string[] = [];
  const million = Math.floor(n / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  if (million) parts.push(threeDigits(million) + "ล้าน");
  if (thousand) parts.push(threeDigits(thousand) + "พัน");
  if (rest) parts.push(threeDigits(rest));

  return parts.join("") + "บาทถ้วน";
}
