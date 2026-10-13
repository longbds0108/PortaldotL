"use client";

import { Droplets, ExternalLink, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Address } from "viem";
import { EXPLORER_URL } from "@/lib/env";
import { formatTokenFloor, shortAddress } from "@/lib/format";
import { NETWORK_NAME } from "@/lib/network";
import { useTokenBalances, type TokenBalance } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const FAUCET_URL = "https://faucet.circle.com/";

/**
 * Wallet token balances (USDC, EURC, cirBTC) read from the token contracts on Arc.
 * Amounts only — no fiat conversion, since the app has no price source.
 */
export function BalancesDialog({ open, onClose, address }: { open: boolean; onClose: () => void; address: Address }) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { balances, isLoading } = useTokenBalances(address, open);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="balances"
          className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-[6px]" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
            transition={{ duration: reduce ? 0 : 0.26, ease: EASE }}
            className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-border bg-card text-card-foreground shadow-[0_24px_64px_var(--popover-shadow)] outline-none"
          >
            <div className="flex items-start justify-between gap-3 p-5 pb-4">
              <div>
                <p className="eyebrow">Balance</p>
                <h2 id={titleId} className="mt-1.5 text-[1.15rem] tracking-[-0.02em]">
                  Wallet tokens
                </h2>
                <p className="mt-0.5 text-[0.74rem] tabular-nums text-muted-foreground">
                  {shortAddress(address)} · {NETWORK_NAME}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <ul className="mx-3 grid gap-1 rounded-[16px] border border-border bg-muted/40 p-1.5">
              {balances.map((t) => (
                <TokenRow key={t.address} token={t} loading={isLoading} />
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-2 p-3">
              <a
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-border text-[0.76rem] text-foreground transition-colors duration-200 hover:border-ring hover:bg-accent"
              >
                <Droplets className="size-4 text-muted-foreground" /> Get tokens
              </a>
              <a
                href={`${EXPLORER_URL}/address/${address}?tab=tokens`}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-border text-[0.76rem] text-foreground transition-colors duration-200 hover:border-ring hover:bg-accent"
              >
                Explorer <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function TokenRow({ token: t, loading }: { token: TokenBalance; loading: boolean }) {
  const amount =
    t.value !== undefined && t.decimals !== undefined
      ? formatTokenFloor(t.value, t.decimals, t.symbol === "cirBTC" ? 8 : 2, t.symbol === "cirBTC" ? 0 : 2)
      : loading
        ? "…"
        : "—";
  return (
    <li className="flex items-center gap-3 rounded-[12px] px-2.5 py-2.5 transition-colors duration-200 hover:bg-accent">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logos */}
      <img src={t.logo} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.88rem] text-foreground">{t.symbol}</p>
        <p className="truncate text-[0.7rem] text-muted-foreground">
          {t.name}
          {t.note ? ` · ${t.note}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("text-[0.95rem] tabular-nums tracking-[-0.01em]", t.error && t.value === undefined && "text-muted-foreground")}>{amount}</p>
        <p className="text-[0.66rem] text-muted-foreground">{t.symbol}</p>
      </div>
      <a
        href={`${EXPLORER_URL}/token/${t.address}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`${t.symbol} contract on the explorer`}
        title={`${t.symbol} contract`}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </li>
  );
}
