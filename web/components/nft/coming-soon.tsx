"use client";

import { ArrowRight, CheckCircle2, Circle, Eye, Gavel, Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNftMetadata } from "@/lib/nft-hooks";
import { PREVIEW_TOKENS } from "@/lib/nft-preview";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { NftMedia } from "./nft-ui";

/*
 * NFT auctions are on the roadmap, not live: this page explains what is coming and how far along it is.
 * No sample auctions, bidders or prices are shown. The live UI (auction-browser, list/detail pages under
 * components/nft) is kept for launch.
 */

const HOW = [
  { icon: Lock, title: "Seal", text: "Bid with a hashed price and lock a deposit larger than it, so the deposit hides your bid." },
  { icon: Eye, title: "Reveal", text: "When bidding ends, open your price. It counts if it meets the reserve and fits your deposit." },
  { icon: Gavel, title: "Settle", text: "The highest valid price wins the NFT. Everyone else withdraws their full deposit." },
];

type Step = { label: string; detail: string; status: "done" | "active" | "next" };
const ROADMAP: Step[] = [
  { label: "Auction design", detail: "Listing, sealed bids with masking deposits, reveal, settlement and payouts", status: "done" },
  { label: "Interface & commitment format", detail: "ISealedNFTAuction and its hash, cross-checked between Solidity and the app", status: "done" },
  { label: "Auction screens", detail: "Browse, list an NFT in one signature, bid, reveal, settle, withdraw", status: "done" },
  { label: "Storage-lean auction contract", detail: `Small enough to deploy affordably on ${NETWORK_NAME}`, status: "active" },
  { label: "Test collection & testnet launch", detail: "Deploy the Plinths test NFTs and open the first auctions", status: "next" },
];

export function NftComingSoon() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {HOW.map((s, i) => (
          <div key={s.title} className="well flex gap-3 rounded-[15px] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.25)] text-link">
              <s.icon className="size-4" />
            </span>
            <div>
              <p className="text-[0.82rem] font-semibold text-foreground">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-[0.76rem] leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div>
              <p className="eyebrow">Roadmap</p>
              <h2 className="mt-2 text-[1.3rem] font-medium text-foreground">Where NFT auctions stand</h2>
            </div>
            <ol className="relative space-y-5 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-overlay/10">
              {ROADMAP.map((s) => (
                <li key={s.label} className="relative flex gap-3">
                  <span className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-full bg-background">
                    {s.status === "done" ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : s.status === "active" ? (
                      <Loader2 className="size-5 animate-spin text-link [animation-duration:2.5s]" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <div>
                    <p className={cn("text-sm font-medium", s.status === "next" ? "text-foreground-soft" : "text-foreground")}>
                      {s.label}
                      {s.status === "active" && <Badge variant="secondary" className="ml-2">In progress</Badge>}
                    </p>
                    <p className="mt-0.5 text-[0.78rem] leading-relaxed text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="eyebrow">First lots</p>
              <h2 className="mt-2 text-[1.3rem] font-medium text-foreground">Plinths test collection</h2>
              <p className="mt-1 text-[0.8rem] text-muted-foreground">
                Three ERC-721 test pieces, already on IPFS, will open the first sealed-bid auctions on {NETWORK_NAME}.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PREVIEW_TOKENS.map((t) => (
                <Artwork key={t.tokenId.toString()} tokenURI={t.tokenURI} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="well flex flex-col items-start justify-between gap-4 rounded-[15px] p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-link" />
          <p className="text-sm text-foreground-soft">
            The same sealed-bid engine already runs tenders. Try it while NFT auctions are on the way.
          </p>
        </div>
        <Button asChild>
          <Link href="/marketplace">
            Browse tenders <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Artwork({ tokenURI }: { tokenURI: string }) {
  const meta = useNftMetadata(tokenURI);
  return (
    <figure className="space-y-1.5">
      <NftMedia tokenURI={tokenURI} className="rounded-[12px]" />
      <figcaption className="truncate text-center text-[0.72rem] text-muted-foreground">{meta.data?.name ?? "…"}</figcaption>
    </figure>
  );
}

/** Compact notice for the Marketplace "NFT" tab. */
export function NftComingSoonNotice() {
  return (
    <div className="well flex flex-col items-start gap-4 rounded-[15px] p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-medium text-foreground">
          NFT auctions <Badge variant="secondary">Coming soon</Badge>
        </p>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Sealed-bid auctions for ERC-721 NFTs on {NETWORK_NAME}, built on the same commit–reveal engine as tenders.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/nft">
          See the roadmap <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
