"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ChainReference } from "@/components/chain-reference";
import { useLang, useT } from "@/components/lang-provider";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tender } from "@/lib/contracts";
import { formatDateTime, shortAddress } from "@/lib/format";
import type { T } from "@/lib/i18n";
import type { BidRow } from "@/lib/hooks";
import { fetchTimeline, type TimelineEvent } from "@/lib/timeline";

const LABEL: Record<TimelineEvent["kind"], (e: TimelineEvent, t: T) => string> = {
  TenderCreated: (_e, t) => t("Tender published", "Gói thầu được đăng"),
  BidSubmitted: (e, t) => t(`Sealed bid submitted by ${shortAddress(e.bidder)}`, `${shortAddress(e.bidder)} gửi hồ sơ niêm phong`),
  BidUpdated: (e, t) => t(`Sealed bid updated by ${shortAddress(e.bidder)}`, `${shortAddress(e.bidder)} cập nhật hồ sơ niêm phong`),
  BidRevealed: (e, t) => t(`Bid revealed by ${shortAddress(e.bidder)}`, `${shortAddress(e.bidder)} công bố giá`),
  TenderAwarded: (e, t) => t(`Awarded to ${shortAddress(e.bidder)}`, `Trao thầu cho ${shortAddress(e.bidder)}`),
};

/** Event timeline with local transaction hashes. Never shows amounts (safe in every state). */
export function OnchainTimeline({ tenderId, tender, bids }: { tenderId: bigint; tender: Tender; bids: BidRow[] }) {
  const client = usePublicClient();
  const t = useT();
  const lang = useLang();
  const key = bids.map((b) => `${b.bidder}:${b.bid.committedBlock}:${b.bid.revealedBlock}`).join(",");
  const { data, isLoading, error } = useQuery({
    queryKey: ["timeline", tenderId.toString(), tender.awardedBlock.toString(), key],
    queryFn: () => fetchTimeline(client!, tenderId, tender),
    enabled: !!client,
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (error)
    return (
      <p className="text-sm text-destructive">
        {t("Could not load events:", "Không tải được sự kiện:")} {error.message}
      </p>
    );
  if (!data?.length) return <p className="text-sm text-muted-foreground">{t("No events yet.", "Chưa có sự kiện nào.")}</p>;

  return (
    <ol className="relative space-y-4 border-l pl-5">
      {data.map((e) => (
        <li key={`${e.txHash}-${e.logIndex}`} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
          <p className="text-sm font-medium">{LABEL[e.kind](e, t)}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {e.timestamp > 0n && <span>{formatDateTime(e.timestamp, lang)}</span>}
            <span>
              {t("block", "block")} {e.blockNumber.toString()}
            </span>
            <ChainReference type="tx" value={e.txHash} />
          </p>
        </li>
      ))}
    </ol>
  );
}
