import { Badge } from "@/components/ui/badge";
import { NftComingSoon } from "@/components/nft/coming-soon";
import NftMarketPage from "@/components/nft/market-page";
import { PageHeader } from "@/components/page-header";
import { NFT_AUCTION_ADDRESS } from "@/lib/env";
import { getT } from "@/lib/i18n-server";
import { NETWORK_NAME } from "@/lib/network";

/** Live auctions once NEXT_PUBLIC_NFT_AUCTION_ADDRESS is set; until then the roadmap page. */
export default async function NftAuctionsPage() {
  if (NFT_AUCTION_ADDRESS) return <NftMarketPage />;
  const t = await getT();
  return (
    <>
      <PageHeader
        eyebrow={`${t("Coming soon · Roadmap", "Sắp ra mắt · Lộ trình")} · ${NETWORK_NAME}`}
        title={t("NFT Auctions", "Đấu giá NFT")}
        actions={
          <Badge variant="secondary" dot className="px-3 py-1.5 text-[0.74rem]">
            {t("In development", "Đang phát triển")}
          </Badge>
        }
        description={t(
          "Sealed-bid auctions for ERC-721 NFTs, paid in tPOTv3 — the same commit–reveal engine that powers Plinths tenders. Prices stay sealed until bidding ends, so nobody can snipe or shade a bid.",
          "Đấu giá niêm phong cho NFT ERC-721, thanh toán bằng tPOTv3 — cùng cơ chế commit–reveal của gói thầu Plinths. Giá được niêm phong đến khi hết hạn đặt giá, nên không ai có thể chen giá phút chót hay dò giá người khác.",
        )}
      />
      <NftComingSoon />
    </>
  );
}
