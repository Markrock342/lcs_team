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

export const FIELD_ALIASES: Record<Exclude<ProspectField, "skip">, string[]> = {
  name: ["name", "ชื่อ", "ชื่อสนาม", "สนาม", "venue", "court", "ลูกค้า", "title"],
  company: ["company", "บริษัท", "องค์กร", "brand"],
  contact_name: ["contact", "contact_name", "ผู้ติดต่อ", "ชื่อผู้ติดต่อ", "เจ้าของ", "manager"],
  contact_phone: ["phone", "tel", "mobile", "เบอร์", "โทร", "โทรศัพท์", "เบอร์โทร"],
  contact_email: ["email", "mail", "อีเมล", "อีเมล์", "e-mail"],
  address: ["address", "ที่อยู่", "location", "ที่ตั้ง"],
  province: ["province", "จังหวัด", "city", "เมือง"],
  notes: ["notes", "note", "หมายเหตุ", "รายละเอียด", "comment"],
};

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-./]+/g, "");
}

export function guessField(header: string): ProspectField {
  const key = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [Exclude<ProspectField, "skip">, string[]]
  >) {
    if (aliases.some((alias) => normalizeHeader(alias) === key || key.includes(normalizeHeader(alias)))) {
      return field;
    }
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
  const phone = digitsOnly(input.contact_phone);
  const email = (input.contact_email ?? "").trim().toLowerCase();
  if (phone.length >= 8) return `p:${phone}`;
  if (email) return `e:${email}`;
  return `n:${input.name.trim().toLowerCase()}`;
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

export async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const [headers = [], ...rows] = matrix.filter((row) =>
      row.some((cell) => String(cell ?? "").trim())
    );
    return {
      headers: headers.map((cell) => String(cell ?? "").trim()),
      rows: rows.map((row) => headers.map((_, index) => String(row[index] ?? "").trim())),
    };
  }

  const text = await file.text();
  const [headers = [], ...rows] = parseDelimited(text);
  return { headers, rows };
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
    if (!name) continue;
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
  if (!Object.values(mapping).includes("name") && headers.length > 0) {
    mapping[0] = "name";
  }
  return mapping;
}
