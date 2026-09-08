"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("theme")
          .eq("id", user.id)
          .single();
        if (error || !data?.theme) return;
        setThemeState(data.theme as ThemeMode);
      } catch {
        // ignore
      }
    }
    loadProfile();
  }, []);

  async function setTheme(t: ThemeMode) {
    setThemeState(t);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ theme: t }).eq("id", user.id);
      }
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
