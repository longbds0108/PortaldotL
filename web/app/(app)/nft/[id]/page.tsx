"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChainReference } from "@/components/chain-reference";
import { Countdown, TimeNote } from "@/components/countdown";
import { AuctionActions } from "@/components/nft/auction-actions";
import { BidsTable } from "@/components/nft/bids-table";
import { AuctionStateBadge, NftMedia, Stat } from "@/components/nft/nft-ui";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNativeAmount } from "@/lib/format";
import { AuctionState, revealedAmountsVisible, type AuctionRow } from "@/lib/nft-auction";
import { useAuction, useNftMetadata, useNftToken } from "@/lib/nft-hooks";
import { useTenderIdParam } from "@/lib/use-tender-id";

export default function AuctionPage() {
  const id = useTenderIdParam();
  const { row, notFound, isLoading, refetch } = useAuction(id);

  if (id === undefined || notFound) {
    return (
      <>
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Auction not found.</CardContent>
        </Card>
      </>
    );
  }
  if (isLoading || !row) return <Skeleton className="h-96" />;
  return <Auction row={row} onChange={refetch} />;
}

function Auction({ row, onChange }: { row: AuctionRow; onChange: () => void }) {
  const { id, auction } = row;
  const { token } = useNftToken(auction.collection, auction.tokenId);
  const meta = useNftMetadata(token.tokenURI);
  const name = meta.data?.name ?? `Token #${auction.tokenId}`;

  return (
    <>
      <BackLink />
      <PageHeader
        eyebrow={`Auction #${id} · ${token.collectionName ?? "ERC-721"} #${auction.tokenId}`}
        title={name}
        description={meta.data?.description}
      />

      {/* Phones: artwork → status/actions → the rest. Desktop: actions in a sticky right column. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0 p-3 lg:col-start-1">
          <NftMedia tokenURI={token.tokenURI} className="mx-auto max-w-[640px]" alt={name} />
        </Card>

        <div className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <StatusCard row={row} />
          <AuctionActions row={row} onChange={onChange} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-start-1">
          {!!meta.data?.attributes?.length && (
            <Card>
              <CardHeader>
                <CardTitle>Traits</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {meta.data.attributes.map((a, i) => (
                  <div key={i} className="well rounded-[12px] px-3 py-2.5">
                    <p className="text-[0.64rem] uppercase tracking-[0.1em] text-muted-foreground">{a.trait_type ?? "Trait"}</p>
                    <p className="mt-1 truncate text-sm text-foreground">{String(a.value)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <BidsTable row={row} />

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Detail label="Collection">
                <ChainReference type="address" value={auction.collection} />
                {token.symbol && <Badge variant="outline" className="ml-2">{token.symbol}</Badge>}
              </Detail>
              <Detail label="Token ID">#{auction.tokenId.toString()}</Detail>
              <Detail label="Seller"><ChainReference type="address" value={auction.seller} /></Detail>
              <Detail label="Listed in block"><ChainReference type="block" value={auction.createdBlock.toString()} /></Detail>
              <Detail label="Standard">ERC-721 · paid in native tPOTv3</Detail>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatusCard({ row }: { row: AuctionRow }) {
  const { id, auction, state } = row;
  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <AuctionStateBadge state={state} />
          <span className="text-xs text-muted-foreground">Auction #{id.toString()}</span>
        </div>
        {state === AuctionState.Open && <Countdown deadline={auction.bidDeadline} label="Bidding ends in" className="text-base" />}
        {state === AuctionState.Reveal && <Countdown deadline={auction.revealDeadline} label="Reveal ends in" className="text-base" />}
        <div className="grid grid-cols-2 gap-4 border-y border-overlay/[0.07] py-4">
          <Stat label="Reserve price">{auction.reservePrice > 0n ? formatNativeAmount(auction.reservePrice) : "No reserve"}</Stat>
          <Stat label="Sealed bids">{auction.bidCount}</Stat>
          <Stat label="Revealed">{revealedAmountsVisible(state) ? `${auction.revealedCount} / ${auction.bidCount}` : "After bidding"}</Stat>
          <Stat label={state === AuctionState.Settled ? "Sold for" : "Highest revealed"}>
            {revealedAmountsVisible(state) && auction.highestBid > 0n ? formatNativeAmount(auction.highestBid) : "—"}
          </Stat>
        </div>
        <div className="grid gap-1.5 text-xs text-muted-foreground">
          <p>Bidding ends {formatDateTime(auction.bidDeadline)}</p>
          <p>Reveal ends {formatDateTime(auction.revealDeadline)}</p>
        </div>
        <TimeNote />
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/nft">
        <ArrowLeft /> NFT Auctions
      </Link>
    </Button>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-overlay/[0.05] pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center text-right">{children}</span>
    </div>
  );
}
