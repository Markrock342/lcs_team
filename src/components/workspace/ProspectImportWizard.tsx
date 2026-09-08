"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@/components/ui";
import {
  DEFAULT_PROSPECT_CATEGORY,
  PROSPECT_CATEGORIES,
  applyMapping,
  defaultMapping,
  guessCategory,
  parseSpreadsheet,
  type MappedProspect,
  type ProspectField,
} from "@/lib/prospect-import";
import type { Profile } from "@/lib/types";

const FIELD_OPTIONS: { value: ProspectField; label: string }[] = [
  { value: "name", label: "ชื่อสนาม" },
  { value: "company", label: "บริษัท" },
  { value: "contact_name", label: "ผู้ติดต่อ" },
  { value: "contact_phone", label: "เบอร์โทร" },
  { value: "contact_email", label: "อีเมล" },
  { value: "address", label: "ที่อยู่" },
  { value: "province", label: "จังหวัด" },
  { value: "notes", label: "หมายเหตุ" },
  { value: "skip", label: "เก็บเป็นข้อมูลเพิ่ม" },
];

export function ProspectImportWizard({
  open,
  onClose,
  profiles,
  currentUserId,
  brokenCount = 0,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  currentUserId?: string;
  brokenCount?: number;
  onImport: (
    rows: MappedProspect[],
    ownerId: string | null,
    options: { category: string; replaceBroken: boolean }
  ) => Promise<string | null>;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ProspectField>>({});
  const [ownerId, setOwnerId] = useState(currentUserId ?? "");
  const [category, setCategory] = useState(DEFAULT_PROSPECT_CATEGORY);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [replaceBroken, setReplaceBroken] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset wizard when closed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeaders([]);
      setRows([]);
      setMapping({});
      setError("");
      setSheetName("");
    }
  }, [open]);

  const preview = useMemo(
    () => applyMapping(headers, rows.slice(0, 5), mapping),
    [headers, rows, mapping]
  );
  const mapped = useMemo(() => applyMapping(headers, rows, mapping), [headers, rows, mapping]);
  const mappedIndexes = headers
    .map((header, index) => ({ header, index, field: mapping[index] ?? "skip" }))
    .filter((item) => item.field !== "skip");
  const skippedIndexes = headers
    .map((header, index) => ({ header, index, field: mapping[index] ?? "skip" }))
    .filter((item) => item.field === "skip");

  async function onFile(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const parsed = await parseSpreadsheet(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(defaultMapping(parsed.headers));
      setSheetName(parsed.sheetName);
      setHeaderRow(parsed.headerRow);
      setCategory(guessCategory(file.name, parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="นำเข้ารายชื่อสนาม">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          วางไฟล์ Excel ได้เลย ระบบจะข้ามแถวหัวเรื่อง หาหัวตารางจริง และไม่ดึงชีต Coverage / Excluded
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="block w-full text-sm"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {headers.length > 0 && (
          <>
            <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm">
              ชีต {sheetName} · หัวตารางแถวที่ {headerRow} · พบ {mapped.length} สนาม
            </p>
            <Select label="หมวดหมู่" value={category} onChange={(e) => setCategory(e.target.value)}>
              {PROSPECT_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              label="มอบหมายให้"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">ยังไม่กำหนด</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </Select>
            {brokenCount > 0 && (
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={replaceBroken}
                  onChange={(e) => setReplaceBroken(e.target.checked)}
                />
                <span>ลบรายชื่อนำเข้าผิด {brokenCount} รายการ (ชื่อเป็นเลข) ก่อนนำเข้าใหม่</span>
              </label>
            )}
            <div className="grid gap-2">
              {mappedIndexes.map((item) => (
                <Select
                  key={`${item.header}-${item.index}`}
                  label={item.header || `คอลัมน์ ${item.index + 1}`}
                  value={item.field}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [item.index]: e.target.value as ProspectField,
                    }))
                  }
                >
                  {FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
            {skippedIndexes.length > 0 && (
              <details className="rounded-xl bg-surface-soft px-3 py-2">
                <summary className="min-h-11 cursor-pointer text-sm font-medium">
                  คอลัมน์ที่เก็บเป็นข้อมูลเพิ่ม {skippedIndexes.length} ช่อง
                </summary>
                <div className="mt-2 grid gap-2">
                  {skippedIndexes.map((item) => (
                    <Select
                      key={`${item.header}-${item.index}`}
                      label={item.header || `คอลัมน์ ${item.index + 1}`}
                      value={item.field}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [item.index]: e.target.value as ProspectField,
                        }))
                      }
                    >
                      {FIELD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ))}
                </div>
              </details>
            )}
            <p className="text-sm text-muted">
              ตัวอย่าง: {preview.map((row) => row.name).join(" · ") || "ยังจับชื่อสนามไม่ได้"}
            </p>
          </>
        )}
        {error && <p className="text-sm text-(--status-red-fg)">{error}</p>}
        <div className="flex gap-2">
          <Button
            disabled={!mapped.length}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const message = await onImport(mapped, ownerId || null, {
                category,
                replaceBroken: replaceBroken && brokenCount > 0,
              });
              setSaving(false);
              if (message) setError(message);
              else onClose();
            }}
          >
            นำเข้า {mapped.length || ""} รายชื่อ
          </Button>
          <Button variant="secondary" type="button" onClick={onClose}>
            ยกเลิก
          </Button>
        </div>
      </div>
    </Modal>
  );
}
