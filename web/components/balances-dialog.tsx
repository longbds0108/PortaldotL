"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Address } from "viem";
import { useBalance } from "wagmi";
import { NODE_CONSOLE_URL } from "@/lib/env";
import { formatTokenFloor, shortAddress } from "@/lib/format";
import { NETWORK_NAME } from "@/lib/network";
import { chain } from "@/lib/wagmi";

export function BalancesDialog({ open, onClose, address }: { open: boolean; onClose: () => void; address: Address }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: open, refetchInterval: 15_000 } });
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={open ? "fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" : "hidden"}>
      <button className="absolute inset-0 bg-background/70 backdrop-blur-[6px]" onClick={onClose} aria-label="Close balance dialog" />
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative w-full max-w-[420px] rounded-[22px] border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Balance</p>
            <h2 id={titleId} className="mt-1.5 text-[1.15rem]">Wallet balance</h2>
            <p className="mt-0.5 text-[0.74rem] text-muted-foreground">{shortAddress(address)} · {NETWORK_NAME}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="my-4 flex items-center justify-between rounded-[16px] border border-border bg-muted/40 p-4">
          <div><p className="font-medium">{chain.nativeCurrency.symbol}</p><p className="text-xs text-muted-foreground">Native token and gas currency</p></div>
          <p className="text-right tabular-nums">{balance.data ? formatTokenFloor(balance.data.value, chain.nativeCurrency.decimals, 4, 2) : balance.isError ? "—" : "…"} <span className="text-xs">{chain.nativeCurrency.symbol}</span></p>
        </div>
        <a href={NODE_CONSOLE_URL} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-full border border-border text-sm hover:bg-accent">Open Node Console <ExternalLink className="size-3.5" /></a>
      </section>
    </div>,
    document.body,
  );
}
