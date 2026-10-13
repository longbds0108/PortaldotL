"use client";

import { Lock, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Countdown } from "@/components/countdown";
import { StateBadge } from "@/components/state-badge";
import { TenderState } from "@/lib/contracts";
import { formatBudget } from "@/lib/format";
import { useTenderMetadata, type TenderRow } from "@/lib/hooks";

export function TenderCard({ row }: { row: TenderRow }) {
  const { tender, state, id } = row;
  const meta = useTenderMetadata(tender.metadataURI);

  return (
    <Link href={`/tenders/${id}`} className="group block focus-visible:outline-none">
      <Card className="flex h-full flex-col bg-[radial-gradient(circle_at_82%_0,var(--card-glow),transparent_38%),linear-gradient(150deg,var(--card-from),var(--surface-to)_68%)] transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge variant="outline">{meta.data?.category ?? "—"}</Badge>
            <StateBadge state={state} />
          </div>
          <p className="eyebrow">Tender #{id.toString()}</p>
          {meta.isLoading ? (
            <Skeleton className="h-6 w-3/4" />
          ) : (
            <CardTitle className="line-clamp-2 text-[1.28rem] text-foreground">{meta.data?.title ?? `Tender #${id}`}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="flex-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-y border-overlay/[0.07] py-4 text-[0.7rem] text-muted-foreground">
            <span className="grid gap-1.5">
              Expected budget
              <b className="text-[0.95rem] font-medium tabular-nums text-foreground">{formatBudget(tender.budgetMin, tender.budgetMax)}</b>
            </span>
            <span className="grid gap-1.5 text-right">
              Bids
              <b className="inline-flex items-center justify-end gap-1 text-[0.95rem] font-medium text-foreground">
                <Users className="size-3.5" /> {tender.bidCount}
              </b>
            </span>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          {state === TenderState.Open && <Countdown deadline={tender.submissionDeadline} label="Closes in" />}
          {state === TenderState.Reveal && <Countdown deadline={tender.revealDeadline} label="Reveal ends in" />}
          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <Lock className="size-3" /> Bid amounts remain confidential
          </p>
        </CardFooter>
      </Card>
    </Link>
  );
}
