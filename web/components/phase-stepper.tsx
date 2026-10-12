import { Check } from "lucide-react";
import { TenderState, type Tender } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "open", label: "Bidding open" },
  { key: "reveal", label: "Reveal" },
  { key: "eval", label: "Evaluation" },
  { key: "done", label: "Result" },
] as const;

function activeIndex(state: TenderState): number {
  switch (state) {
    case TenderState.Open:
      return 0;
    case TenderState.Reveal:
      return 1;
    case TenderState.Evaluation:
      return 2;
    default:
      return 3;
  }
}

export function PhaseStepper({ tender, state }: { tender: Tender; state: TenderState }) {
  const active = activeIndex(state);
  const sub = [
    `until ${formatDateTime(tender.submissionDeadline)}`,
    `until ${formatDateTime(tender.revealDeadline)}`,
    "buyer selects winner",
    state === TenderState.Cancelled ? "cancelled" : state === TenderState.Failed ? "no valid bids" : state === TenderState.Awarded ? "awarded" : "pending",
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {STEPS.map((s, i) => {
        const done = i < active || (i === 3 && active === 3);
        const current = i === active && active !== 3;
        return (
          <li key={s.key} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary ring-4 ring-primary/15",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !done && !current && "text-muted-foreground")}>{s.label}</p>
              <p className="text-xs text-muted-foreground">{sub[i]}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
