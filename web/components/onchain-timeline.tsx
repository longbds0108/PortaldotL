"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ExplorerLink } from "@/components/explorer-link";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tender } from "@/lib/contracts";
import { formatDateTime, shortAddress } from "@/lib/format";
import type { BidRow } from "@/lib/hooks";
import { fetchTimeline, type TimelineEvent } from "@/lib/timeline";

const LABEL: Record<TimelineEvent["kind"], (e: TimelineEvent) => string> = {
  TenderCreated: () => "Tender published",
  BidSubmitted: (e) => `Sealed bid submitted by ${shortAddress(e.bidder)}`,
  BidUpdated: (e) => `Sealed bid updated by ${shortAddress(e.bidder)}`,
  BidRevealed: (e) => `Bid revealed by ${shortAddress(e.bidder)}`,
  TenderAwarded: (e) => `Awarded to ${shortAddress(e.bidder)}`,
};

/** Event timeline with explorer links. Never shows amounts (safe in every state). */
export function OnchainTimeline({ tenderId, tender, bids }: { tenderId: bigint; tender: Tender; bids: BidRow[] }) {
  const client = usePublicClient();
  const key = bids.map((b) => `${b.bidder}:${b.bid.committedBlock}:${b.bid.revealedBlock}`).join(",");
  const { data, isLoading, error } = useQuery({
    queryKey: ["timeline", tenderId.toString(), tender.awardedBlock.toString(), key],
    queryFn: () => fetchTimeline(client!, tenderId, tender, bids),
    enabled: !!client,
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (error) return <p className="text-sm text-destructive">Could not load events: {error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No events yet.</p>;

  return (
    <ol className="relative space-y-4 border-l pl-5">
      {data.map((e) => (
        <li key={`${e.txHash}-${e.logIndex}`} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
          <p className="text-sm font-medium">{LABEL[e.kind](e)}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(e.timestamp)}</span>
            <span>block {e.blockNumber.toString()}</span>
            <ExplorerLink type="tx" value={e.txHash} />
          </p>
        </li>
      ))}
    </ol>
  );
}
