import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Docs typography & blocks, modelled on vitael.xyz/docs (36px semibold title, 15/28 muted body,
 * small accent subheadings, bordered cards with an uppercase coloured label, chips, callouts),
 * recoloured with the Hedgora palette (blue accent instead of lavender, cream highlights).
 */

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-[15px] leading-7 text-[#979eb8]">{children}</p>;
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>;
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-10 scroll-mt-40 text-[15px] font-semibold tracking-[-0.01em] text-[#8fb4ff]">
      {children}
    </h3>
  );
}

const TONE = {
  blue: "text-[#8fb4ff]",
  teal: "text-[#4fd1c5]",
  cream: "text-[#e8e3d5]",
  amber: "text-[#e8b54c]",
  red: "text-[#f08a8d]",
} as const;
export type Tone = keyof typeof TONE;

export function Cards({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid gap-4">{children}</div>;
}

export function DocCard({ label, tone = "blue", children }: { label: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.02] px-5 py-5 transition-colors hover:border-white/[0.16] sm:px-6">
      <p className={cn("text-[13px] font-semibold uppercase tracking-[0.04em]", TONE[tone])}>{label}</p>
      <div className="mt-2.5 text-[14.5px] leading-6 text-[#a7acc5]">{children}</div>
    </div>
  );
}

export function Chips({ items }: { items: { label: string; tone?: Tone }[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {items.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-2.5 rounded-[12px] border border-white/[0.09] bg-white/[0.02] px-4 py-2.5 text-[14px] font-semibold text-white">
          <i className={cn("size-2 rounded-full bg-current", TONE[c.tone ?? "blue"])} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="mt-4 grid gap-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-[14px] border border-white/[0.09] bg-white/[0.02] px-5 py-4">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[#8fb4ff]/40 text-[12px] font-semibold text-[#8fb4ff]">
            {i + 1}
          </span>
          <div>
            <p className="text-[14.5px] font-semibold text-white">{s.title}</p>
            <div className="mt-1 text-[14px] leading-6 text-[#a7acc5]">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/[0.09]">
      <table className="w-full min-w-[520px] text-left text-[14px]">
        <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.12em] text-[#7d84a0]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] text-[#a7acc5]">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("px-4 py-3 align-top leading-6", j === 0 && "font-semibold text-white")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[0.86em] text-[#cfe2ff]">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-[14px] border border-white/[0.09] bg-[#070d18] px-5 py-4 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[13px] leading-6 text-[#cfe2ff]">
      {children}
    </pre>
  );
}

export function Callout({ label, tone = "amber", children }: { label: string; tone?: Tone; children: ReactNode }) {
  const bar = { blue: "border-[#8fb4ff]", teal: "border-[#4fd1c5]", cream: "border-[#e8e3d5]", amber: "border-[#e8b54c]", red: "border-[#f08a8d]" }[tone];
  return (
    <div className={cn("mt-6 border-l-2 py-1 pl-4", bar)}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", TONE[tone])}>{label}</p>
      <div className="mt-1.5 text-[14px] leading-6 text-[#979eb8]">{children}</div>
    </div>
  );
}

export function Ul({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 grid gap-2.5 text-[15px] leading-7 text-[#979eb8]">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-[#8fb4ff]" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
