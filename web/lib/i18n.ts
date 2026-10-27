/**
 * UI language (English / Vietnamese). Shared by server and client code (no "use client" here).
 *
 * The choice lives in a cookie, like the sidebar width, so server-rendered pages come out in the right language with
 * no flash. Strings sit next to the code that shows them as pairs: `t("Create tender", "Tạo gói thầu")`; `t` also
 * takes JSX for sentences with links or emphasis. Amounts keep the fixed `7,500.00 tPOTv3` format in both languages.
 */
export type Lang = "en" | "vi";

export const LANG_COOKIE = "plinths_lang";

export function parseLang(value?: string | null): Lang {
  return value === "vi" ? "vi" : "en";
}

/** A UI string in both languages, for tables of labels defined outside components. */
export type Text = readonly [en: string, vi: string];

/** Picks the current language's half of a pair: `t("Open", "Đang mở")`, or `t(text)` for a stored Text. */
export type T = {
  <V>(en: V, vi: V): V;
  (text: Text): string;
};

const isText = (v: unknown, rest: unknown[]): v is Text => rest.length === 0 && Array.isArray(v);
const pickEn = ((en: unknown, ...rest: unknown[]) => (isText(en, rest) ? en[0] : en)) as T;
const pickVi = ((en: unknown, ...rest: unknown[]) => (isText(en, rest) ? en[1] : rest[0])) as T;

export function translator(lang: Lang): T {
  return lang === "vi" ? pickVi : pickEn;
}

/** Browser-only copy of the current language (set by LangProvider); the server always keeps "en". */
let activeLang: Lang = "en";

export function setActiveLang(lang: Lang) {
  activeLang = lang;
}

/** `t` for code that runs on user action outside a component: transaction toasts, thrown errors. */
export const tr: T = ((...args: [unknown, ...unknown[]]) => (activeLang === "vi" ? pickVi : pickEn)(...(args as [Text]))) as T;

/** BCP 47 tag for Intl date formatting (amounts stay en-US, see lib/format.ts). */
export function dateLocale(lang: Lang): string {
  return lang === "vi" ? "vi-VN" : "en-US";
}
