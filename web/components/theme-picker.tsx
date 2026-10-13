"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useRef } from "react";
import { setPreference, usePreferences, type ThemeChoice } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light / Dark / System segmented control with a sliding thumb (radio-group semantics; arrow keys move the choice).
 * Vertical + icon-only fits the collapsed sidebar rail.
 */
export function ThemePicker({ vertical = false, labels = true, className }: { vertical?: boolean; labels?: boolean; className?: string }) {
  const { theme } = usePreferences();
  const reduce = useReducedMotion();
  const groupRef = useRef<HTMLDivElement>(null);
  // Several pickers can be mounted at once (sidebar + mobile menu): keep their thumbs independent.
  const thumbId = useId();

  const choose = (v: ThemeChoice) => setPreference("theme", v);
  const move = (dir: 1 | -1) => {
    const i = THEMES.findIndex((t) => t.value === theme);
    choose(THEMES[(i + dir + THEMES.length) % THEMES.length].value);
    // Roving focus follows the checked option.
    requestAnimationFrame(() => groupRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={(e) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        move(dir as 1 | -1);
      }}
      className={cn("flex gap-0.5 rounded-[14px] border border-border bg-muted p-0.5", vertical && "flex-col", className)}
    >
      {THEMES.map((t) => {
        const on = t.value === theme;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t.label}
            title={t.label}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(t.value)}
            className={cn(
              "relative flex h-9 items-center justify-center gap-1.5 rounded-[11px] text-[0.72rem] font-medium transition-colors duration-200",
              vertical ? "w-full shrink-0" : "flex-1",
              on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={`theme-thumb-${thumbId}`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[11px] bg-primary shadow-sm"
              />
            )}
            <t.icon className="relative size-4 shrink-0" aria-hidden="true" />
            {labels && <span className="relative">{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
