"use client";

import { useSyncExternalStore } from "react";
import { PREFS_KEY } from "./theme-boot";

/** UI preferences kept in this browser only (the account panel's toggles). */
export type Preferences = {
  /** Hide wallet balances below SMALL_BALANCE_BASE_UNITS in the header and account panel. */
  hideSmallBalances: boolean;
  /** Workspace colour theme. "system" follows the device setting. */
  theme: ThemeChoice;
};

export type ThemeChoice = "dark" | "light" | "system";

/** 1 tPOTv3 in native base units (18 decimals). */
export const SMALL_BALANCE_BASE_UNITS = 10n ** 18n;

const DEFAULTS: Preferences = { hideSmallBalances: false, theme: "dark" };

let current: Preferences | undefined;
const listeners = new Set<() => void>();

function read(): Preferences {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    current = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    current = DEFAULTS;
  }
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  current = { ...read(), [key]: value };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(current));
  } catch {
    // Storage blocked (private mode): the choice still applies until reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

// ───────────────────────── theme ─────────────────────────

export type Theme = "dark" | "light";

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== "system") return choice;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Theme currently applied to <html> (what RainbowKit's modal should match). */
export function useAppliedTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      const o = new MutationObserver(l);
      o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => o.disconnect();
    },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}
