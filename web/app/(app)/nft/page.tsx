import { Badge } from "@/components/ui/badge";
import { NftComingSoon } from "@/components/nft/coming-soon";
import { PageHeader } from "@/components/page-header";
import { NETWORK_NAME } from "@/lib/network";

export default function NftAuctionsPage() {
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
