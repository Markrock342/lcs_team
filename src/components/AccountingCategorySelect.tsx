"use client";

import { Select } from "@/components/ui";
import type { AccountingCategory, AccountingEntryType } from "@/lib/extras-types";
import { categoriesByType } from "@/lib/finance";

type Props = {
  categories: AccountingCategory[];
  type: AccountingEntryType;
  value: string;
  onChange: (slug: string) => void;
};

export function AccountingCategorySelect({
  categories,
  type,
  value,
  onChange,
}: Props) {
  const options = categoriesByType(categories, type);

  return (
    <Select
      label="หมวดบัญชี"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
    >
      <option value="">เลือกหมวด</option>
      {options.map((category) => (
        <option key={category.id} value={category.slug}>
          {category.name}
        </option>
      ))}
    </Select>
  );
}
