"use client";

import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { Activity, Check, ChevronDown, Copy, Droplets, ExternalLink, LogOut, Plus, Wallet, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAccount, useBalance, useConnections, useDisconnect, type Connection } from "wagmi";
import { NODE_CONSOLE_URL } from "@/lib/env";
import { formatNativeAmountFloor, shortAddress } from "@/lib/format";
import { NETWORK_NAME } from "@/lib/network";
import { SMALL_BALANCE_BASE_UNITS, setPreference, usePreferences } from "@/lib/preferences";
import { loadProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

const EASE = [0.22, 1, 0.36, 1] as const;
const NETWORK_CONSOLE_URL = "https://node-console.feso-apps.xyz/";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION;
const COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT;

/**
 * Header wallet control. Disconnected or on the wrong network it is RainbowKit's own button (connect / switch);
 * once connected to PortaldotV3 it opens the account & settings panel instead of RainbowKit's account modal.
 */
export function AccountMenu() {
  const { address, isConnected, chainId } = useAccount();
  if (!isConnected || !address || chainId !== chain.id) {
    return (
      <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} showBalance={{ smallScreen: false, largeScreen: true }} />
    );
  }
  return <AccountPanel address={address} />;
}

function AccountPanel({ address }: { address: `0x${string}` }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const reduce = useReducedMotion();
  const prefs = usePreferences();
  // Native tPOTv3 (14 decimals), floored to two decimals — same figure as the dashboard.
  const balance = useBalance({ address, chainId: chain.id, query: { refetchInterval: 15_000 } });
  const hidden = prefs.hideSmallBalances && balance.data !== undefined && balance.data.value < SMALL_BALANCE_BASE_UNITS;
  const balanceText = balance.data ? formatNativeAmountFloor(balance.data.value) : balance.isError ? "—" : "…";

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    // A Radix dropdown (Language) renders in a portal: clicks / Escape inside it belong to the dropdown, not to us.
    const selectOpen = () => !!document.querySelector("[data-radix-popper-content-wrapper]");
    const onPointer = (e: PointerEvent) => {
      if (selectOpen()) return;
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      // Radix handles Escape first (capture phase) and marks it handled when it closes its dropdown.
      if (e.key === "Escape" && !e.defaultPrevented && !selectOpen()) close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1 rounded-[14px] border border-border bg-card/80 p-1">
        {!hidden && (
          <span className="hidden px-2.5 text-[0.82rem] font-medium tabular-nums text-foreground sm:inline">{balanceText}</span>
        )}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label="Account and settings"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-9 items-center gap-2 rounded-[11px] bg-muted pl-1.5 pr-2 text-[0.82rem] font-semibold text-foreground transition-colors duration-200 hover:bg-accent",
            open && "bg-accent",
          )}
        >
          <Avatar address={address} className="size-6" />
          <span className="hidden tabular-nums sm:inline">{shortAddress(address)}</span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Account and settings"
            tabIndex={-1}
            initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : -6, scale: reduce ? 1 : 0.98 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
            style={{ transformOrigin: "top right" }}
            className="fixed inset-x-2.5 top-[4.75rem] z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-[20px] border border-border bg-card text-card-foreground shadow-2xl outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+12px)] sm:w-[360px]"
          >
            <PanelBody
              address={address}
              balanceText={hidden ? "Hidden · under 1 tPOTv3" : balanceText}
              onClose={() => close(true)}
              onNavigate={() => close()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelBody({
  address,
  balanceText,
  onClose,
  onNavigate,
}: {
  address: `0x${string}`;
  balanceText: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const prefs = usePreferences();
  const connections = useConnections();
  const { connector: active } = useAccount();
  const { disconnect, disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [switching, setSwitching] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => setName(loadProfile().businessName.trim()), []);

  // RainbowKit only offers its connect modal while disconnected: disconnect first, then open it once available.
  useEffect(() => {
    if (switching && openConnectModal) {
      openConnectModal();
      setSwitching(false);
    }
  }, [switching, openConnectModal]);

  return (
    <div className="grid">
      {/* Profile header */}
      <div className="flex items-center gap-3 p-4">
        <Avatar address={address} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-medium tracking-[-0.01em]">{name || "Hedgora account"}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
            <span className="tabular-nums">{shortAddress(address)}</span>
            <CopyButton value={address} />
          </div>
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

      <Separator />

      {/* Wallets */}
      <Section title="Wallets">
        <ul className="grid gap-1">
          {connections.map((c) => (
            <WalletRow
              key={c.connector.uid}
              connection={c}
              active={c.connector.uid === active?.uid}
              balanceText={balanceText}
              network={NETWORK_NAME}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={async () => {
            await disconnectAsync().catch(() => undefined);
            onNavigate();
            setSwitching(true);
          }}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-border text-[0.8rem] text-muted-foreground transition-colors duration-200 hover:border-ring hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" /> Use a different wallet
        </button>
      </Section>

      <Separator />

      {/* Account actions */}
      <div className="grid gap-0.5 p-2">
        <MenuItem as="a" href={NODE_CONSOLE_URL} icon={<Activity />} trailing={<ExternalLink className="size-3.5" />} onClick={onNavigate}>
          Open Node Console
        </MenuItem>
        <MenuItem as="button" icon={<LogOut />} danger onClick={() => disconnect()}>
          Sign out
        </MenuItem>
      </div>

      <Separator />

      {/* Preferences */}
      <Section title="Preferences">
        <div className="grid gap-1">
          <PrefRow label="Hide small balances" hint="Balances under 1 tPOTv3">
            <Switch checked={prefs.hideSmallBalances} onChange={(v) => setPreference("hideSmallBalances", v)} label="Hide small balances" />
          </PrefRow>
          <a
            href={NETWORK_CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            className="group -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 transition-colors duration-200 hover:bg-accent"
          >
            <span className="min-w-0">
              <span className="block text-[0.82rem] text-foreground">Open network console</span>
              <span className="block text-[0.68rem] text-muted-foreground">PortaldotV3 Node Console</span>
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors duration-200 group-hover:border-ring group-hover:text-foreground">
              <Droplets className="size-4" />
            </span>
          </a>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[0.68rem] text-muted-foreground">
        <span>
          Version {VERSION ?? "—"}
          {COMMIT ? ` · ${COMMIT}` : ""}
        </span>
        <Link href="/profile" onClick={onNavigate} className="transition-colors hover:text-foreground">
          Profile & Settings →
        </Link>
      </div>
    </div>
  );
}

// ───────────────────────── pieces ─────────────────────────

function WalletRow({ connection, active, balanceText, network }: { connection: Connection; active: boolean; balanceText: string; network?: string }) {
  const { connector, accounts } = connection;
  const icon = typeof connector.icon === "string" ? connector.icon.trim() : undefined;
  return (
    <li className="flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors duration-200 hover:bg-accent">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-muted text-muted-foreground">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs supplied by the wallet
          <img src={icon} alt="" className="size-6" />
        ) : (
          <Wallet className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[0.82rem] text-foreground">
          <span className="truncate">{connector.name}</span>
          {active && <i aria-label="Active" className="status-dot shrink-0 text-success" />}
        </span>
        <span className="block truncate text-[0.7rem] tabular-nums text-muted-foreground">
          {shortAddress(accounts[0])}
          {network ? ` · ${network}` : ""}
        </span>
      </span>
      {active && <span className="shrink-0 text-[0.78rem] tabular-nums text-foreground">{balanceText}</span>}
    </li>
  );
}

function MenuItem({
  as,
  href,
  icon,
  trailing,
  danger,
  onClick,
  children,
}: {
  as: "a" | "button";
  href?: string;
  icon: ReactNode;
  trailing?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls = cn(
    "flex h-10 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[0.82rem] text-foreground transition-colors duration-200 hover:bg-accent [&>svg:first-child]:size-4 [&>svg:first-child]:text-muted-foreground",
    danger && "hover:text-destructive [&:hover>svg:first-child]:text-destructive",
  );
  const body = (
    <>
      {icon}
      <span className="flex-1">{children}</span>
      {trailing && <span className="text-muted-foreground">{trailing}</span>}
    </>
  );
  return as === "a" ? (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-4 pt-3.5">
      <p className="eyebrow mb-2.5">{title}</p>
      {children}
    </div>
  );
}

function PrefRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.82rem] text-foreground">{label}</p>
        {hint && <p className="text-[0.68rem] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-1/2 size-[18px] -translate-y-1/2 rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          checked ? "translate-x-5 bg-primary-foreground" : "bg-muted-foreground",
        )}
      />
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? "Address copied" : "Copy address"}
      title={copied ? "Copied" : "Copy address"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard blocked: nothing to do, the address is visible.
        }
      }}
      className="grid size-6 place-items-center rounded-full transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function Separator() {
  return <div role="separator" className="mx-4 h-px bg-border" />;
}

/** Deterministic avatar from the address, drawn with the app's own colour tokens. */
function Avatar({ address, className }: { address: string; className?: string }) {
  const angle = parseInt(address.slice(2, 6), 16) % 360;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full ring-1 ring-border", className)}
      style={{
        background: `conic-gradient(from ${angle}deg, var(--brand), var(--brand-soft), var(--primary), var(--brand))`,
      }}
    />
  );
}
