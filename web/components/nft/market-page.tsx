"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { AuctionBrowser } from "@/components/nft/auction-browser";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NETWORK_NAME } from "@/lib/network";

export default function NftMarketPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        eyebrow={`${t("Sealed-bid NFT auctions", "Đấu giá NFT niêm phong")} · ${NETWORK_NAME}`}
        title={t("NFT Auctions", "Đấu giá NFT")}
        description={t(
          "List an ERC-721 you own on PortaldotV3 and let collectors bid in tPOTv3. Prices stay sealed until bidding ends, so nobody can snipe or shade a bid.",
          "Đăng bán một ERC-721 bạn sở hữu trên PortaldotV3 để nhà sưu tầm đặt giá bằng tPOTv3. Giá được niêm phong đến khi hết hạn đặt giá, nên không ai có thể chen giá phút chót hay dò giá người khác.",
        )}
        actions={
          <Button asChild>
            <Link href="/nft/list">
              <Plus /> {t("List NFT", "Đăng bán NFT")}
            </Link>
          </Button>
        }
      />
      <AuctionBrowser />
    </>
  );
}
