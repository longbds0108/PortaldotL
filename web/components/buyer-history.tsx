"use client";

import { ShieldAlert, UserRound } from "lucide-react";
import type { Address } from "viem";
import { ExplorerLink } from "@/components/explorer-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuyerHistory } from "@/lib/hooks";

/** Buyer track record computed from on-chain tenders only (no off-chain reputation). */
export function BuyerHistory({ buyer }: { buyer: Address }) {
  const { history: h } = useBuyerHistory(buyer);

  const flags: string[] = [];
  if (h) {
    if (h.total <= 1) flags.push("First tender from this wallet — no track record yet.");
    if (h.stalled > 0)
      flags.push(`${h.stalled} tender${h.stalled > 1 ? "s" : ""} with revealed bids still not awarded more than 7 days after the reveal deadline.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4" /> About the buyer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          <ExplorerLink type="address" value={buyer} /> · history on this contract
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!h ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label="Tenders published" value={h.total} />
              <Stat label="Awarded" value={h.awarded} />
              <Stat label="Open / revealing" value={h.active} />
              <Stat label="Awaiting award" value={h.awaitingAward} />
              <Stat label="Not awarded > 7 days" value={h.stalled} warn={h.stalled > 0} />
              <Stat label="No bid revealed" value={h.failed} />
              <Stat label="Cancelled (no bids)" value={h.cancelled} />
            </dl>
            {flags.length > 0 && (
              <ul className="space-y-1.5 rounded-[12px] border border-[rgba(232,181,76,.25)] bg-[rgba(232,181,76,.06)] p-3 text-xs text-warning-fg">
                {flags.map((f) => (
                  <li key={f} className="flex gap-2">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={warn ? "font-medium text-warning" : "font-medium"}>{value}</dd>
    </div>
  );
}
