"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { AuctionBrowser } from "@/components/nft/auction-browser";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NETWORK_NAME } from "@/lib/network";

export default function NftMarketPage() {
  return (
    <>
      <PageHeader
        eyebrow={`Sealed-bid NFT auctions · ${NETWORK_NAME}`}
        title="NFT Auctions"
        description="List an ERC-721 you own on PortaldotV3 and let collectors bid in tPOTv3. Prices stay sealed until bidding ends, so nobody can snipe or shade a bid."
        actions={
          <Button asChild>
            <Link href="/nft/list">
              <Plus /> List NFT
            </Link>
          </Button>
        }
      />
      <AuctionBrowser />
    </>
  );
}
