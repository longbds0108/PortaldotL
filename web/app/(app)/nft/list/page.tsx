import { redirect } from "next/navigation";

/** NFT auctions are on the roadmap; the live screen (components/nft) returns at launch. */
export default function Page() {
  redirect("/nft");
}
