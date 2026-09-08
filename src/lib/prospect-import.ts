export type ProspectField =
  | "name"
  | "company"
  | "contact_name"
  | "contact_phone"
  | "contact_email"
  | "address"
  | "province"
  | "notes"
  | "skip";

export type MappedProspect = {
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  province: string | null;
  notes: string | null;
  external_key: string;
  extra: Record<string, string>;
};

export const DEFAULT_PROSPECT_CATEGORY = "แบดมินตัน";
export const PROSPECT_CATEGORIES = ["แบดมินตัน", "อื่นๆ"] as const;

export const FIELD_ALIASES: Record<Exclude<ProspectField, "skip">, string[]> = {
  name: ["ชื่อสนาม", "ชื่อสถานที่", "ชื่อลูกค้า", "สนาม", "venue", "courtname", "name", "title", "ลูกค้า"],
  company: ["company", "บริษัท", "องค์กร", "brand"],
  contact_name: ["contactname", "ผู้ติดต่อ", "ชื่อผู้ติดต่อ", "เจ้าของ", "manager"],
  contact_phone: ["phone", "tel", "mobile", "telephone", "เบอร์", "โทรศัพท์", "เบอร์โทร", "โทร"],
  contact_email: ["email", "mail", "e-mail", "อีเมล", "อีเมล์"],
  address: ["address", "ที่อยู่", "location", "ที่ตั้ง"],
  province: ["province", "จังหวัด"],
  notes: ["notes", "note", "หมายเหตุ", "รายละเอียด", "comment", "pitch", "pitchที่แนะนำ", "pitchที่แนะนำ"],
};

const SKIP_ALIASES = ["no", "no.", "ลำดับ", "#", "checked", "เช็ค"];

const HEADER_HINTS = [
  "ชื่อสนาม",
  "จังหวัด",
  "โทรศัพท์",
  "อีเมล",
  "email",
  "เบอร์",
  "venue",
  "province",
  "phone",
];

export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./|—–]+/g, "");
}

function isThai(value: string) {
  return /[ก-๙]/.test(value);
}

function headerMatches(header: string, alias: string) {
  const key = normalizeHeader(header);
  const needle = normalizeHeader(alias);
  if (!key || !needle) return false;
  if (key === needle) return true;
  if (isThai(alias) && needle.length >= 2 && key.includes(needle)) return true;
  return false;
}

export function guessField(header: string): ProspectField {
  const key = normalizeHeader(header);
  if (!key || SKIP_ALIASES.some((alias) => normalizeHeader(alias) === key)) return "skip";
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [Exclude<ProspectField, "skip">, string[]]
  >) {
    if (aliases.some((alias) => headerMatches(header, alias))) return field;
  }
  return "skip";
}

export function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function prospectKey(input: {
  name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
}) {
  const phone = (input.contact_phone ?? "").replace(/\D/g, "");
  const email = (input.contact_email ?? "").trim().toLowerCase();
  if (phone.length >= 8) return `p:${phone}`;
  if (email) return `e:${email}`;
  return `n:${input.name.trim().toLowerCase()}`;
}

export function isBrokenProspectName(name: string) {
  const value = name.trim();
  if (!value) return true;
  if (/^no\.?$/i.test(value)) return true;
  if (/^\d+$/.test(value)) return true;
  return /^no\.?\s*\d+$/i.test(value);
}

export function prospectCategory(extra: Record<string, unknown> | null | undefined) {
  const value = extra?.category;
  return typeof value === "string" && value.trim() ? value.trim() : "อื่นๆ";
}

export function extraText(extra: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!extra) return "";
  for (const key of keys) {
    const value = extra[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function guessCategory(fileName: string, headers: string[]) {
  const haystack = `${fileName} ${headers.join(" ")}`.toLowerCase();
  if (haystack.includes("badminton") || haystack.includes("แบด") || headers.some((h) => h.includes("ชื่อสนาม"))) {
    return DEFAULT_PROSPECT_CATEGORY;
  }
  return "อื่นๆ";
}

export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "," || char === "\t" || char === ";") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

function asMatrix(rows: unknown[][]) {
  return rows
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
    .filter((row) => row.some((cell) => cell));
}

function headerScore(cells: string[]) {
  const keys = cells.map(normalizeHeader);
  return HEADER_HINTS.reduce((score, hint) => {
    const needle = normalizeHeader(hint);
    return keys.some((key) => key === needle || (needle.length >= 3 && key.includes(needle)))
      ? score + 1
      : score;
  }, 0);
}

function findHeaderIndex(matrix: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  matrix.slice(0, 10).forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 2 ? bestIndex : 0;
}

function pickSheetName(names: string[]) {
  const skip = /coverage|excluded|notes|readme|วิธีใช้/i;
  return (
    names.find((name) => /lead/i.test(name) && !skip.test(name)) ??
    names.find((name) => !skip.test(name)) ??
    names[0]
  );
}

function tableFromMatrix(matrix: string[][]) {
  const headerIndex = findHeaderIndex(matrix);
  const headers = matrix[headerIndex] ?? [];
  const rows = matrix.slice(headerIndex + 1).map((row) =>
    headers.map((_, index) => String(row[index] ?? "").trim())
  );
  return { headers, rows, headerIndex };
}

export async function parseSpreadsheet(
  file: File
): Promise<{ headers: string[]; rows: string[][]; sheetName: string; headerRow: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = pickSheetName(workbook.SheetNames);
    const sheet = workbook.Sheets[sheetName];
    const matrix = asMatrix(
      XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      })
    );
    const table = tableFromMatrix(matrix);
    return { ...table, sheetName, headerRow: table.headerIndex + 1 };
  }

  const text = await file.text();
  const table = tableFromMatrix(parseDelimited(text));
  return { ...table, sheetName: file.name, headerRow: table.headerIndex + 1 };
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: Record<number, ProspectField>
): MappedProspect[] {
  const mapped: MappedProspect[] = [];
  for (const row of rows) {
    const extra: Record<string, string> = {};
    const values: Partial<Record<Exclude<ProspectField, "skip">, string>> = {};
    headers.forEach((header, index) => {
      const field = mapping[index] ?? "skip";
      const value = (row[index] ?? "").trim();
      if (!value) return;
      if (field === "skip") {
        extra[header || `col_${index + 1}`] = value;
        return;
      }
      values[field] = values[field] ? `${values[field]} ${value}` : value;
    });
    const name = (values.name ?? values.company ?? "").trim();
    if (!name || isBrokenProspectName(name)) continue;
    const prospect: MappedProspect = {
      name,
      company: values.company?.trim() || null,
      contact_name: values.contact_name?.trim() || null,
      contact_phone: values.contact_phone?.trim() || null,
      contact_email: values.contact_email?.trim() || null,
      address: values.address?.trim() || null,
      province: values.province?.trim() || null,
      notes: values.notes?.trim() || null,
      extra,
      external_key: "",
    };
    prospect.external_key = prospectKey(prospect);
    mapped.push(prospect);
  }
  return mapped;
}

export function defaultMapping(headers: string[]): Record<number, ProspectField> {
  const mapping: Record<number, ProspectField> = {};
  headers.forEach((header, index) => {
    mapping[index] = guessField(header);
  });
  if (!Object.values(mapping).includes("name")) {
    const named = headers.findIndex((header) => /ชื่อ|สนาม|venue|court/i.test(header));
    if (named >= 0) mapping[named] = "name";
  }
  return mapping;
}
