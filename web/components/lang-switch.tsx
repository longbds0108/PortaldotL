"use client";

import { useLang, useSetLang } from "@/components/lang-provider";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: "en", label: "EN", name: "English" },
  { value: "vi", label: "VI", name: "Tiếng Việt" },
];

/** EN | VI segmented control (radio-group semantics), styled like the theme picker. */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const setLang = useSetLang();
  return (
    <div
      role="radiogroup"
      aria-label={lang === "vi" ? "Ngôn ngữ" : "Language"}
      className={cn("flex gap-0.5 rounded-full border border-border bg-muted p-0.5", className)}
    >
      {LANGS.map((l) => {
        const on = l.value === lang;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={l.name}
            title={l.name}
            lang={l.value}
            onClick={() => !on && setLang(l.value)}
            className={cn(
              "h-[30px] flex-1 rounded-full px-2.5 text-[0.72rem] font-semibold tracking-[0.04em] transition-colors duration-200",
              on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
