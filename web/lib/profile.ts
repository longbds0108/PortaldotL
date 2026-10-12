import type { Category } from "./metadata";

/** Local, per-browser profile (MVP — no on-chain identity yet). */
export type Profile = { businessName: string; category: Category | "" ; website: string };

const KEY = "blindbid.profile.v1";
const EMPTY: Profile = { businessName: "", category: "", website: "" };

export function loadProfile(): Profile {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Profile>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveProfile(p: Profile): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
