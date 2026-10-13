"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { TenderState } from "@/lib/contracts";
import { cn } from "@/lib/utils";

// ───────────────────────── phases (shared colour key) ─────────────────────────

export type PhaseKey = "awarded" | "evaluation" | "reveal" | "open" | "closed";

/** One colour per tender phase, used by every dashboard chart. Open is hatched: its prices are still sealed. */
export const PHASES: { key: PhaseKey; label: string; color: string; hatch?: boolean }[] = [
  { key: "awarded", label: "Awarded", color: "#3f7be0" },
  { key: "evaluation", label: "Evaluation", color: "#83aaff" },
  { key: "reveal", label: "Reveal", color: "#e8b54c" },
  { key: "open", label: "Open · sealed", color: "#4fd1c5", hatch: true },
  { key: "closed", label: "Failed / cancelled", color: "#e5484d" },
];
const PHASE = Object.fromEntries(PHASES.map((p) => [p.key, p])) as Record<PhaseKey, (typeof PHASES)[number]>;

export function phaseOf(state: TenderState): PhaseKey {
  switch (state) {
    case TenderState.Open:
      return "open";
    case TenderState.Reveal:
      return "reveal";
    case TenderState.Evaluation:
      return "evaluation";
    case TenderState.Awarded:
      return "awarded";
    default:
      return "closed";
  }
}

/** Fill for a phase: solid colour, or hatched for sealed phases. */
export function phaseFill(key: PhaseKey): { className?: string; style: CSSProperties } {
  const p = PHASE[key];
  return p.hatch
    ? { className: "hatch", style: { "--hatch": p.color, boxShadow: `inset 0 0 0 1px ${p.color}` } as CSSProperties }
    : { style: { background: p.color } };
}

export function Swatch({ phase, className }: { phase: PhaseKey; className?: string }) {
  const fill = phaseFill(phase);
  return <i aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full", fill.className, className)} style={fill.style} />;
}

export function PhaseLegend({ phases = PHASES.map((p) => p.key) }: { phases?: PhaseKey[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[0.68rem] text-muted-foreground">
      {phases.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <Swatch phase={k} />
          {PHASE[k].label}
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── bars ─────────────────────────

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Label + "n (p%)" + thin progress bar. */
export function MeterRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const p = pct(count, total);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[0.76rem]">
        <span className="text-foreground-soft">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <b className="font-medium text-foreground">{count}</b> ({p}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-overlay/[0.06]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}

/** Horizontal bar split into phase segments. */
export function StackBar({ parts }: { parts: { phase: PhaseKey; count: number }[] }) {
  const total = parts.reduce((s, p) => s + p.count, 0);
  return (
    <div className="flex h-2 gap-[3px] overflow-hidden rounded-full bg-overlay/[0.06]">
      {total > 0 &&
        parts
          .filter((p) => p.count > 0)
          .map((p) => {
            const fill = phaseFill(p.phase);
            return (
              <span
                key={p.phase}
                title={`${PHASE[p.phase].label}: ${p.count}`}
                className={cn("h-full rounded-full transition-[width] duration-700", fill.className)}
                style={{ ...fill.style, width: `${(p.count / total) * 100}%` }}
              />
            );
          })}
    </div>
  );
}

// ───────────────────────── bid activity (pill columns) ─────────────────────────

export type BidColumn = { id: bigint; title?: string; bids: number; revealed: number; phase: PhaseKey };

/** One pill per tender, height = number of sealed bids. Hover / focus shows the tender's public figures. */
export function BidColumns({ columns }: { columns: BidColumn[] }) {
  const max = Math.max(1, ...columns.map((c) => c.bids));
  const busiest = columns.reduce((best, c, i) => (c.bids > columns[best].bids ? i : best), 0);
  const [active, setActive] = useState<number>();
  const shown = active ?? busiest;
  const a = columns[shown];

  return (
    <div className="grid gap-4">
      <div className="flex h-[190px] items-end justify-between gap-2 sm:gap-3" onMouseLeave={() => setActive(undefined)}>
        {columns.map((c, i) => {
          const fill = phaseFill(c.phase);
          const h = c.bids === 0 ? 0 : Math.max(14, (c.bids / max) * 100);
          return (
            <Link
              key={c.id.toString()}
              href={`/tenders/${c.id}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(undefined)}
              aria-label={`Tender #${c.id}: ${c.bids} bid${c.bids === 1 ? "" : "s"}, ${c.revealed} revealed`}
              className="group flex h-full min-w-0 max-w-[58px] flex-1 flex-col items-center justify-end gap-2 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "rounded-full border border-overlay/10 bg-muted px-2 py-0.5 text-[0.62rem] tabular-nums text-foreground transition-opacity",
                  i === shown ? "opacity-100" : "opacity-0",
                )}
              >
                {c.bids}
              </span>
              <span className="relative flex w-full flex-1 items-end">
                {h === 0 ? (
                  <span className="h-2 w-full rounded-full bg-overlay/[0.07]" />
                ) : (
                  <span
                    className={cn(
                      "w-full rounded-full transition-[height,filter] duration-700 group-hover:brightness-110",
                      fill.className,
                      i === shown && "shadow-[0_0_0_2px_color-mix(in_srgb,var(--overlay)_14%,transparent)]",
                    )}
                    style={{ ...fill.style, height: `${h}%` }}
                  />
                )}
              </span>
              <span className={cn("text-[0.66rem] tabular-nums", i === shown ? "text-foreground" : "text-muted-foreground")}>#{c.id.toString()}</span>
            </Link>
          );
        })}
      </div>
      {a && (
        <p className="well flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full px-4 py-2 text-[0.72rem] text-muted-foreground">
          <Swatch phase={a.phase} />
          <span className="max-w-[16rem] truncate text-foreground">{a.title ?? `Tender #${a.id}`}</span>
          <span>·</span>
          <span className="tabular-nums">
            {a.bids} bid{a.bids === 1 ? "" : "s"} sealed · {a.revealed} revealed
          </span>
          <span>·</span>
          <span>{PHASE[a.phase].label}</span>
        </p>
      )}
    </div>
  );
}

// ───────────────────────── gauge ─────────────────────────

/** Half-donut split into segments (counts), with a big percentage in the middle. */
export function Gauge({
  segments,
  value,
  caption,
}: {
  segments: { key: string; count: number; color: string; hatch?: boolean }[];
  value: string;
  caption: string;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const visible = segments.filter((s) => s.count > 0);
  const gap = visible.length > 1 ? 1.2 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={`${value} ${caption}`}>
        <defs>
          {visible
            .filter((s) => s.hatch)
            .map((s) => (
              <pattern key={s.key} id={`hatch-${s.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={s.color} fillOpacity=".16" />
                <rect width="2.4" height="6" fill={s.color} />
              </pattern>
            ))}
        </defs>
        <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke="var(--overlay)" strokeOpacity=".06" strokeWidth="24" pathLength={100} />
        {total > 0 &&
          visible.map((s) => {
            const len = (s.count / total) * 100;
            const dash = Math.max(0, len - gap);
            const el = (
              <path
                key={s.key}
                d="M 22 100 A 78 78 0 0 1 178 100"
                fill="none"
                stroke={s.hatch ? `url(#hatch-${s.key})` : s.color}
                strokeWidth="24"
                pathLength={100}
                strokeDasharray={`${dash} 100`}
                strokeDashoffset={-offset}
                className="transition-[stroke-dasharray] duration-700"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 grid justify-items-center">
        <strong className="text-[2.3rem] font-normal leading-none tracking-[-0.05em] tabular-nums">{value}</strong>
        <span className="mt-1 text-[0.7rem] text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}
