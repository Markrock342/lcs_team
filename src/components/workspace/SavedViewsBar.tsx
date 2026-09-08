"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  deleteSavedView,
  loadSavedViews,
  PRESET_VIEWS,
  saveView,
} from "@/lib/saved-views";
import type { SavedView } from "@/lib/extras-types";

export function SavedViewsBar({
  page,
  filters,
  onApply,
}: {
  page: SavedView["page"];
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    void loadSavedViews(page).then(setViews);
  }, [page]);

  const presets = PRESET_VIEWS[page];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => (
        <button
          key={preset.name}
          type="button"
          onClick={() => onApply(preset.filters)}
          className="min-h-11 rounded-xl bg-surface-soft px-3 text-sm hover:bg-card-hover"
        >
          {preset.name}
        </button>
      ))}
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onApply(view.filters)}
          className="min-h-11 rounded-xl border border-border px-3 text-sm hover:bg-card-hover"
        >
          {view.name}
          <span
            role="button"
            tabIndex={0}
            aria-label={`ลบมุมมอง ${view.name}`}
            className="ml-2 inline-flex min-h-8 min-w-8 items-center justify-center text-muted"
            onClick={(event) => {
              event.stopPropagation();
              void deleteSavedView(view.id).then(() =>
                setViews((prev) => prev.filter((item) => item.id !== view.id))
              );
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              void deleteSavedView(view.id).then(() =>
                setViews((prev) => prev.filter((item) => item.id !== view.id))
              );
            }}
          >
            ×
          </span>
        </button>
      ))}
      <div className="flex min-w-52 flex-1 items-center gap-2">
        <Input
          label="ชื่อมุมมอง"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ตามวันนี้"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!name.trim()}
          onClick={async () => {
            const result = await saveView(page, name.trim(), filters);
            if (result.view) setViews((prev) => [...prev, result.view!]);
            setName("");
          }}
        >
          บันทึกมุมมอง
        </Button>
      </div>
    </div>
  );
}
