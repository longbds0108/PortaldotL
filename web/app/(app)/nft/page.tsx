import { Badge } from "@/components/ui/badge";
import { NftComingSoon } from "@/components/nft/coming-soon";
import NftMarketPage from "@/components/nft/market-page";
import { PageHeader } from "@/components/page-header";
import { NFT_AUCTION_ADDRESS } from "@/lib/env";
import { NETWORK_NAME } from "@/lib/network";

/** Live auctions once NEXT_PUBLIC_NFT_AUCTION_ADDRESS is set; until then the roadmap page. */
export default function NftAuctionsPage() {
  if (NFT_AUCTION_ADDRESS) return <NftMarketPage />;
  return (
    <>
      <PageHeader
        eyebrow={`Coming soon · Roadmap · ${NETWORK_NAME}`}
        title="NFT Auctions"
        actions={
          <Badge variant="secondary" dot className="px-3 py-1.5 text-[0.74rem]">
            In development
          </Badge>
        }
        description="Sealed-bid auctions for ERC-721 NFTs, paid in tPOTv3 — the same commit–reveal engine that powers Plinths tenders. Prices stay sealed until bidding ends, so nobody can snipe or shade a bid."
      />
      <NftComingSoon />
    </>
  );
}
