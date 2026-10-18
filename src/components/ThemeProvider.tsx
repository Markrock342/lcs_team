"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { neonRequest } from "@/lib/neon/client";
import type { ThemeMode } from "@/lib/extras-types";

const ThemeContext = createContext<{
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (t: ThemeMode) => void;
}>({ theme: "dark", toggle: () => {}, setTheme: () => {} });

function syncThemeDocument(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#071018" : "#f3f6f8");
  localStorage.setItem("lcs-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("lcs-theme") as ThemeMode | null) ?? "dark";
  });

  useEffect(() => {
    syncThemeDocument(theme);
  }, [theme]);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { profile } = await neonRequest<{ profile: { theme?: ThemeMode | null } }>(
          "/api/neon/profiles?me=1",
          { cache: "no-store" },
        );
        if (profile.theme) setThemeState(profile.theme);
      } catch {
        // ignore
      }
    }
    loadProfile();
  }, []);

  async function setTheme(t: ThemeMode) {
    setThemeState(t);
    try {
      await neonRequest("/api/neon/profiles", {
        method: "PATCH",
        body: JSON.stringify({ data: { theme: t } }),
      });
    } catch {
      // ignore
    }
  }

  return (
    <ThemeContext.Provider
      value={{ theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark"), setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
