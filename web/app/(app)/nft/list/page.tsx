import { redirect } from "next/navigation";
import ListNftPage from "@/components/nft/list-nft-page";
import { NFT_AUCTION_ADDRESS } from "@/lib/env";

/** Live once NEXT_PUBLIC_NFT_AUCTION_ADDRESS is set; until then NFT auctions are a roadmap page. */
export default function Page() {
  if (!NFT_AUCTION_ADDRESS) redirect("/nft");
  return <ListNftPage />;
}
