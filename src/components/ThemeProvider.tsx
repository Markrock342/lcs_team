"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { neonRequest } from "@/lib/neon/client";
import type { ThemeMode } from "@/lib/extras-types";

const ThemeContext = createContext<{ theme: ThemeMode; toggle: () => void; setTheme: (theme: ThemeMode) => void }>({
  theme: "light", toggle: () => {}, setTheme: () => {},
});

function validTheme(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function syncThemeDocument(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#141619" : "#f5f6f8");
  try { localStorage.setItem("lcs-theme", theme); } catch { /* Theme still works when storage is unavailable. */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const revision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const initial = document.documentElement.dataset.theme;
    const selected = validTheme(initial) ? initial : "light";
    syncThemeDocument(selected);
    // Synchronize the persisted preference installed before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(selected);
    const version = revision.current;
    void neonRequest<{ profile: { theme?: ThemeMode | null } }>("/api/neon/profiles?me=1", { cache: "no-store" })
      .then(({ profile }) => {
        if (cancelled || revision.current !== version || !validTheme(profile.theme)) return;
        setThemeState(profile.theme);
        syncThemeDocument(profile.theme);
      }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function setTheme(next: ThemeMode) {
    revision.current += 1;
    setThemeState(next);
    syncThemeDocument(next);
    void neonRequest("/api/neon/profiles", { method: "PATCH", body: JSON.stringify({ data: { theme: next } }) }).catch(() => {});
  }

  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark"), setTheme }}>
    {children}
  </ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
