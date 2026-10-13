"use client";

import { useEffect } from "react";
import { resolveTheme, usePreferences } from "@/lib/preferences";

/**
 * Applies the chosen theme to <html> on app routes and follows the device setting when "system" is chosen.
 * Leaving the workspace (landing, docs — designed dark-only) restores the default dark theme.
 */
export function ThemeSync() {
  const { theme } = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => (root.dataset.theme = resolveTheme(theme));
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => () => void delete document.documentElement.dataset.theme, []);
  return null;
}
