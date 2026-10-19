import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/*
 * Shared pieces for the Proof of Fairness pages (Dispute Center, Analytics, Reputation).
 * These pages are designed but not wired to data yet: every value renders as "—" and every action is disabled,
 * so nothing on them can be mistaken for a real result.
 */

export function InDesignBadge() {
  return (
    <Badge variant="secondary" dot className="px-3 py-1.5 text-[0.74rem]">
      In design
    </Badge>
  );
}

/** One-line note under the header: the page layout is final, the data is not connected yet. */
export function DesignNote({ children }: { children: ReactNode }) {
  return <p className="-mt-4 mb-8 max-w-2xl text-[0.78rem] text-muted-foreground">{children}</p>;
}

/** Metric tile with no value yet. */
export function MetricTile({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
  return (
    <div className="well flex flex-col gap-3 rounded-[15px] p-4">
      <span className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
        <Icon className="size-3.5 text-link" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[1.6rem] font-medium leading-none text-foreground-soft tabular-nums" aria-label={`${label}: not available yet`}>
        —
      </span>
      {hint && <span className="text-[0.7rem] leading-relaxed text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Card with an eyebrow, a title and an optional description. */
export function Panel({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className={cn("text-[1.2rem] font-medium text-foreground", eyebrow && "mt-2")}>{title}</h2>
            {description && <p className="mt-1 max-w-xl text-[0.8rem] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Dashed area that stands in for a chart or a table until data is connected. */
export function Placeholder({ icon: Icon, title, children, className }: { icon: LucideIcon; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("well grid min-h-[200px] place-content-center justify-items-center gap-2 rounded-[14px] border-dashed border-overlay/[0.12] p-6 text-center", className)}>
      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-[0.85rem] font-medium text-foreground-soft">{title}</p>
      {children && <p className="max-w-sm text-[0.75rem] leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Table header with an empty body row. */
export function EmptyTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-overlay/[0.07]">
      <table className="w-full min-w-[560px] text-left text-[0.78rem]">
        <thead>
          <tr className="border-b border-overlay/[0.07] text-muted-foreground">
            {columns.map((c) => (
              <th key={c} scope="col" className="px-4 py-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
              {message}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Numbered vertical steps. */
export function StepList({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:left-[13px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-overlay/10">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-3">
          <span className="relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.3)] bg-background text-[0.72rem] text-link">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{s.title}</p>
            <p className="mt-0.5 text-[0.78rem] leading-relaxed text-muted-foreground">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
