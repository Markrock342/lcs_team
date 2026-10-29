"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด";
  return <button type="button" onClick={toggle} aria-label={label} title={label}
    className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-card-hover hover:text-foreground">
    {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
    <span className="hidden xl:inline">{theme === "dark" ? "ธีมมืด" : "ธีมสว่าง"}</span>
  </button>;
}
