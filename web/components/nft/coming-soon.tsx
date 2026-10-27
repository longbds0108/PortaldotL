"use client";

import { ArrowRight, CheckCircle2, Circle, Eye, Gavel, Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNftMetadata } from "@/lib/nft-hooks";
import { PREVIEW_TOKENS } from "@/lib/nft-preview";
import { NETWORK_NAME } from "@/lib/network";
import type { Text } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NftMedia } from "./nft-ui";

/*
 * NFT auctions are on the roadmap, not live: this page explains what is coming and how far along it is.
 * No sample auctions, bidders or prices are shown. The live UI (auction-browser, list/detail pages under
 * components/nft) is kept for launch.
 */

const HOW: { icon: typeof Lock; title: Text; text: Text }[] = [
  {
    icon: Lock,
    title: ["Seal", "Niêm phong"],
    text: [
      "Bid with a hashed price and lock a deposit larger than it, so the deposit hides your bid.",
      "Đặt giá bằng mã băm và khóa một khoản cọc lớn hơn giá, để khoản cọc che giấu giá của bạn.",
    ],
  },
  {
    icon: Eye,
    title: ["Reveal", "Công bố"],
    text: [
      "When bidding ends, open your price. It counts if it meets the reserve and fits your deposit.",
      "Khi hết hạn đặt giá, hãy mở giá. Giá được tính nếu đạt giá sàn và không vượt khoản cọc.",
    ],
  },
  {
    icon: Gavel,
    title: ["Settle", "Kết thúc"],
    text: [
      "The highest valid price wins the NFT. Everyone else withdraws their full deposit.",
      "Giá hợp lệ cao nhất thắng NFT. Những người khác rút lại toàn bộ tiền cọc.",
    ],
  },
];

type Step = { label: Text; detail: Text; status: "done" | "active" | "next" };
const ROADMAP: Step[] = [
  {
    label: ["Auction design", "Thiết kế đấu giá"],
    detail: [
      "Listing, sealed bids with masking deposits, reveal, settlement and payouts",
      "Đăng bán, giá niêm phong với tiền cọc che giấu, công bố, kết thúc và chi trả",
    ],
    status: "done",
  },
  {
    label: ["Interface & commitment format", "Interface & định dạng commitment"],
    detail: ["ISealedNFTAuction and its hash, cross-checked between Solidity and the app", "ISealedNFTAuction và mã băm của nó, đối chiếu giữa Solidity và ứng dụng"],
    status: "done",
  },
  {
    label: ["Auction screens", "Màn hình đấu giá"],
    detail: ["Browse, list an NFT in one signature, bid, reveal, settle, withdraw", "Duyệt, đăng bán NFT bằng một chữ ký, đặt giá, công bố, kết thúc, rút tiền"],
    status: "done",
  },
  {
    label: ["Storage-lean auction contract", "Contract đấu giá tiết kiệm lưu trữ"],
    detail: [`Small enough to deploy affordably on ${NETWORK_NAME}`, `Đủ nhỏ để triển khai với chi phí hợp lý trên ${NETWORK_NAME}`],
    status: "active",
  },
  {
    label: ["Test collection & testnet launch", "Bộ sưu tập thử & ra mắt testnet"],
    detail: ["Deploy the Plinths test NFTs and open the first auctions", "Triển khai NFT thử của Plinths và mở các phiên đấu giá đầu tiên"],
    status: "next",
  },
];

export function NftComingSoon() {
  const t = useT();
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {HOW.map((s, i) => (
          <div key={s.title[0]} className="well flex gap-3 rounded-[15px] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.25)] text-link">
              <s.icon className="size-4" />
            </span>
            <div>
              <p className="text-[0.82rem] font-semibold text-foreground">
                {i + 1}. {t(s.title)}
              </p>
              <p className="mt-1 text-[0.76rem] leading-relaxed text-muted-foreground">{t(s.text)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div>
              <p className="eyebrow">{t("Roadmap", "Lộ trình")}</p>
              <h2 className="mt-2 text-[1.3rem] font-medium text-foreground">{t("Where NFT auctions stand", "Tiến độ đấu giá NFT")}</h2>
            </div>
            <ol className="relative space-y-5 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-overlay/10">
              {ROADMAP.map((s) => (
                <li key={s.label[0]} className="relative flex gap-3">
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
                      {t(s.label)}
                      {s.status === "active" && (
                        <Badge variant="secondary" className="ml-2">
                          {t("In progress", "Đang làm")}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-[0.78rem] leading-relaxed text-muted-foreground">{t(s.detail)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="eyebrow">{t("First lots", "Lô đầu tiên")}</p>
              <h2 className="mt-2 text-[1.3rem] font-medium text-foreground">{t("Plinths test collection", "Bộ sưu tập thử của Plinths")}</h2>
              <p className="mt-1 text-[0.8rem] text-muted-foreground">
                {t(
                  `Three ERC-721 test pieces, already on IPFS, will open the first sealed-bid auctions on ${NETWORK_NAME}.`,
                  `Ba tác phẩm ERC-721 thử, đã có trên IPFS, sẽ mở màn các phiên đấu giá niêm phong đầu tiên trên ${NETWORK_NAME}.`,
                )}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PREVIEW_TOKENS.map((token) => (
                <Artwork key={token.tokenId.toString()} tokenURI={token.tokenURI} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="well flex flex-col items-start justify-between gap-4 rounded-[15px] p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-link" />
          <p className="text-sm text-foreground-soft">
            {t(
              "The same sealed-bid engine already runs tenders. Try it while NFT auctions are on the way.",
              "Cơ chế niêm phong này đã chạy cho gói thầu. Hãy dùng thử trong lúc chờ đấu giá NFT.",
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/marketplace">
            {t("Browse tenders", "Xem gói thầu")} <ArrowRight />
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
  const t = useT();
  return (
    <div className="well flex flex-col items-start gap-4 rounded-[15px] p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-medium text-foreground">
          {t("NFT auctions", "Đấu giá NFT")} <Badge variant="secondary">{t("Coming soon", "Sắp ra mắt")}</Badge>
        </p>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          {t(
            `Sealed-bid auctions for ERC-721 NFTs on ${NETWORK_NAME}, built on the same commit–reveal engine as tenders.`,
            `Đấu giá niêm phong cho NFT ERC-721 trên ${NETWORK_NAME}, dùng cùng cơ chế commit–reveal với gói thầu.`,
          )}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/nft">
          {t("See the roadmap", "Xem lộ trình")} <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
