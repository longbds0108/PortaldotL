import { redirect } from "next/navigation";
import AuctionPage from "@/components/nft/auction-page";
import { NFT_AUCTION_ADDRESS } from "@/lib/env";

/** Live once NEXT_PUBLIC_NFT_AUCTION_ADDRESS is set; until then NFT auctions are a roadmap page. */
export default function Page() {
  if (!NFT_AUCTION_ADDRESS) redirect("/nft");
  return <AuctionPage />;
}
