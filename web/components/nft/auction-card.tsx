"use client";

import { Lock, Users } from "lucide-react";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { useT } from "@/components/lang-provider";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNativeAmount, shortAddress } from "@/lib/format";
import { AuctionState, type AuctionRow } from "@/lib/nft-auction";
import { useNftMetadata, useNftToken } from "@/lib/nft-hooks";
import { AuctionStateBadge, NftMedia, Stat } from "./nft-ui";

export function AuctionCard({ row }: { row: AuctionRow }) {
  const { id, auction, state } = row;
  const { token } = useNftToken(auction.collection, auction.tokenId);
  const meta = useNftMetadata(token.tokenURI);
  const t = useT();

  return (
    <Link href={`/nft/${id}`} className="group block focus-visible:outline-none">
      <Card className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_82%_0,var(--card-glow),transparent_38%),linear-gradient(150deg,var(--card-from),var(--surface-to)_68%)] transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className="relative p-3 pb-0">
          <NftMedia tokenURI={token.tokenURI} className="transition-transform duration-300 group-hover:scale-[1.015]" />
          <AuctionStateBadge state={state} className="absolute left-6 top-6 bg-background/80 backdrop-blur" />
        </div>
        <CardHeader className="pb-3">
          <p className="eyebrow">
            {token.symbol ?? shortAddress(auction.collection)} · #{auction.tokenId.toString()}
          </p>
          {meta.isLoading ? (
            <Skeleton className="h-6 w-2/3" />
          ) : (
            <CardTitle className="line-clamp-1 text-[1.2rem] text-foreground">{meta.data?.name ?? `Token #${auction.tokenId}`}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="flex-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-y border-overlay/[0.07] py-4">
            {state === AuctionState.Settled ? (
              <Stat label={t("Sold for", "Đã bán với giá")}>{formatNativeAmount(auction.highestBid)}</Stat>
            ) : (
              <Stat label={t("Reserve price", "Giá sàn")}>
                {auction.reservePrice > 0n ? formatNativeAmount(auction.reservePrice) : t("No reserve", "Không có giá sàn")}
              </Stat>
            )}
            <Stat label={t("Sealed bids", "Giá niêm phong")} className="text-right">
              <span className="inline-flex items-center justify-end gap-1">
                <Users className="size-3.5" /> {auction.bidCount}
              </span>
            </Stat>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          {state === AuctionState.Open && <Countdown deadline={auction.bidDeadline} label={t("Bidding ends in", "Hết hạn đặt giá sau")} />}
          {state === AuctionState.Reveal && <Countdown deadline={auction.revealDeadline} label={t("Reveal ends in", "Hết hạn công bố sau")} />}
          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <Lock className="size-3" />
            {state === AuctionState.Open
              ? t("Bid amounts stay sealed until bidding ends", "Giá được niêm phong đến khi hết hạn đặt giá")
              : t(`Auction #${id}`, `Phiên đấu giá #${id}`)}
          </p>
        </CardFooter>
      </Card>
    </Link>
  );
}
