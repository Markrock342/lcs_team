"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@/components/ui";
import {
  applyMapping,
  defaultMapping,
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
  { value: "skip", label: "ไม่นำเข้า" },
];

export function ProspectImportWizard({
  open,
  onClose,
  profiles,
  currentUserId,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  currentUserId?: string;
  onImport: (rows: MappedProspect[], ownerId: string | null) => Promise<string | null>;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ProspectField>>({});
  const [ownerId, setOwnerId] = useState(currentUserId ?? "");
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
    }
  }, [open]);

  const preview = useMemo(
    () => applyMapping(headers, rows.slice(0, 5), mapping),
    [headers, rows, mapping]
  );
  const mapped = useMemo(() => applyMapping(headers, rows, mapping), [headers, rows, mapping]);

  async function onFile(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const parsed = await parseSpreadsheet(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(defaultMapping(parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="นำเข้ารายชื่อสนาม">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          รองรับ Excel และ CSV สูงสุดหลายร้อยแถว ระบบจะจับคู่คอลัมน์และข้ามรายชื่อซ้ำจากเบอร์หรืออีเมล
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="block w-full text-sm"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {headers.length > 0 && (
          <>
            <div className="grid gap-2">
              {headers.map((header, index) => (
                <Select
                  key={`${header}-${index}`}
                  label={`คอลัมน์: ${header || `คอลัมน์ ${index + 1}`}`}
                  value={mapping[index] ?? "skip"}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [index]: e.target.value as ProspectField,
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
            <p className="text-sm text-muted">
              พบ {mapped.length} รายชื่อพร้อมนำเข้า ตัวอย่าง {preview.length} แถวแรก:{" "}
              {preview.map((row) => row.name).join(", ") || "—"}
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
              const message = await onImport(mapped, ownerId || null);
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
