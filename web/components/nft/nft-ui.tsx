"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ImageOff, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AUCTION_STATE_LABEL, AuctionState } from "@/lib/nft-auction";
import { nftAuctionEnabled, useNftMetadata } from "@/lib/nft-hooks";
import { nftImageUrl } from "@/lib/nft-metadata";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

/** NFT artwork from its tokenURI metadata, square, with loading and broken-image states. */
export function NftMedia({ tokenURI, className, alt }: { tokenURI?: string; className?: string; alt?: string }) {
  const meta = useNftMetadata(tokenURI);
  const src = nftImageUrl(meta.data?.image);
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-[14px] bg-overlay/[0.04]", className)}>
      {meta.isLoading ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : src && !broken ? (
        // NFT images come from arbitrary IPFS/HTTPS hosts, so next/image's host allowlist does not fit here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? meta.data?.name ?? "NFT"} className="absolute inset-0 size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOff className="size-8" />
        </div>
      )}
    </div>
  );
}

const VARIANT = {
  [AuctionState.Open]: "success",
  [AuctionState.Reveal]: "warning",
  [AuctionState.Settlement]: "secondary",
  [AuctionState.Settled]: "outline",
  [AuctionState.NoSale]: "muted",
  [AuctionState.Cancelled]: "muted",
} as const;

export function AuctionStateBadge({ state, className }: { state: AuctionState; className?: string }) {
  return (
    <Badge variant={VARIANT[state]} dot={state !== AuctionState.Cancelled && state !== AuctionState.NoSale} className={className}>
      {AUCTION_STATE_LABEL[state]}
    </Badge>
  );
}

/** Requires a connected wallet on PortaldotV3 (skipped in preview so the layout stays visible). */
export function NftWalletGate({ children, message = "Connect your wallet to continue." }: { children: ReactNode; message?: string }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!nftAuctionEnabled) return <>{children}</>;
  if (!isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">{message}</p>
          <ConnectButton />
        </CardContent>
      </Card>
    );
  }
  if (chainId !== chain.id) {
    return (
      <Alert variant="warning" className="items-center">
        <AlertTriangle />
        <span className="flex-1">Your wallet is on another network. Plinths runs on {chain.name}.</span>
        <Button size="sm" disabled={isPending} onClick={() => switchChain({ chainId: chain.id })}>
          Switch network
        </Button>
      </Alert>
    );
  }
  return <>{children}</>;
}

/** Small label/value pair used in auction stat grids. */
export function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
      <b className="text-[0.95rem] font-medium tabular-nums text-foreground">{children}</b>
    </div>
  );
}
