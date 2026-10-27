"use client";

import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useT } from "@/components/lang-provider";
import { cn } from "@/lib/utils";

/*
 * Minimal toast notifications (top-right). Transactions report every stage here — waiting for the wallet,
 * waiting for the chain, confirmed, failed — so an error is never hidden below a button or behind a spinner.
 */

export type ToastKind = "loading" | "success" | "error" | "info";
export type ToastItem = { id: string; kind: ToastKind; title: string; description?: string };

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Shows or updates a toast (same id = same toast). Loading toasts stay until replaced; others auto-close. */
function show(t: Omit<ToastItem, "id"> & { id?: string }): string {
  const id = t.id ?? Math.random().toString(36).slice(2);
  const next: ToastItem = { id, kind: t.kind, title: t.title, description: t.description };
  items = items.some((x) => x.id === id) ? items.map((x) => (x.id === id ? next : x)) : [...items, next].slice(-4);
  clearTimeout(timers.get(id));
  if (t.kind !== "loading") timers.set(id, setTimeout(() => dismiss(id), t.kind === "error" ? 9000 : 5000));
  emit();
  return id;
}

export const toast = { show, dismiss };

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: ToastItem[] = [];

const ICON = {
  loading: <Loader2 className="size-4 animate-spin text-link" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-destructive" />,
  info: <Info className="size-4 text-link" />,
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  const tt = useT();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-[14px] border bg-background/95 p-3.5 text-sm shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur",
            t.kind === "error" ? "border-[rgba(229,72,77,.35)]" : "border-overlay/10",
          )}
        >
          <span className="mt-0.5 shrink-0">{ICON[t.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{t.title}</p>
            {t.description && <p className="mt-0.5 break-words text-[0.8rem] leading-relaxed text-muted-foreground">{t.description}</p>}
          </div>
          <button
            type="button"
            aria-label={tt("Dismiss", "Đóng")}
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-overlay/10 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
