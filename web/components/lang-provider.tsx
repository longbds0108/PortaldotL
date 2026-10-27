"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE, setActiveLang, translator, type Lang, type T } from "@/lib/i18n";

type LangState = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangState>({ lang: "en", setLang: () => {} });

/** Current language for client components; the root layout seeds it from the cookie. */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState(initial);
  if (typeof window !== "undefined") setActiveLang(lang);
  const router = useRouter();
  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLangState(next);
      // Server components (docs, page titles) read the cookie: render them again in the new language.
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext).lang;
}

export function useSetLang(): (lang: Lang) => void {
  return useContext(LangContext).setLang;
}

export function useT(): T {
  return translator(useLang());
}
