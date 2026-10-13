"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { Tender } from "@/lib/contracts";
import { formatDateTime, formatDuration, formatNativeWei } from "@/lib/format";
import { bidRisks } from "@/lib/risk";
import { cn } from "@/lib/utils";

/** Shown before bidding: the reveal window, the bond and its rules, plus warnings for risky settings. */
export function BidRiskNotice({ tender, className }: { tender: Tender; className?: string }) {
  const { revealWindowS, warnings } = bidRisks(tender);
  const worst = warnings.some((w) => w.level === "high") ? "high" : warnings.length ? "medium" : "none";
  return (
    <div
      className={cn(
        "rounded-[16px] border p-4 text-[0.82rem] leading-relaxed",
        worst === "high"
          ? "border-[rgba(229,72,77,.35)] bg-[rgba(229,72,77,.07)]"
          : worst === "medium"
            ? "border-[rgba(232,181,76,.3)] bg-[rgba(232,181,76,.06)]"
            : "border-[rgba(113,161,232,.16)] bg-[rgba(7,7,12,.22)]",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        {worst === "none" ? <Info className="size-4 text-[#b9d5ff]" /> : <AlertTriangle className={cn("size-4", worst === "high" ? "text-destructive" : "text-warning")} />}
        Before you bid
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Reveal window ({formatDuration(revealWindowS)})</dt>
          <dd>
            {formatDateTime(tender.submissionDeadline)} → {formatDateTime(tender.revealDeadline)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Bid bond</dt>
          <dd>{tender.bidBond > 0n ? `${formatNativeWei(tender.bidBond)} locked until you reveal` : "None — only network fees"}</dd>
        </div>
      </dl>
      {tender.bidBond > 0n && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reveal in time and you can withdraw the full bond, win or lose. Miss the window and it goes to the Hedgora treasury —
          never to the buyer.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w.text} className={cn("flex gap-2 text-xs", w.level === "high" ? "text-[#f08a8d]" : "text-[#ecc979]")}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
