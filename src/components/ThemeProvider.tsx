"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ThemeMode } from "@/lib/extras-types";

const ThemeContext = createContext<{
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (t: ThemeMode) => void;
}>({ theme: "dark", toggle: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("lcs-theme") as ThemeMode | null;
    if (saved) applyTheme(saved);
    else applyTheme("dark");

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
        applyTheme(data.theme as ThemeMode);
      } catch {
        // ignore
      }
    }
    loadProfile();
  }, []);

  function applyTheme(t: ThemeMode) {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("lcs-theme", t);
  }

  async function setTheme(t: ThemeMode) {
    applyTheme(t);
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
