"use client";

import { Gem, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { useT } from "@/components/lang-provider";
import { ConfigGate } from "@/components/gates";
import { AuctionBrowser } from "@/components/nft/auction-browser";
import { NftComingSoonNotice } from "@/components/nft/coming-soon";
import { PageHeader } from "@/components/page-header";
import { TenderCard } from "@/components/tender-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_LABEL, TenderState } from "@/lib/contracts";
import { useTenders } from "@/lib/hooks";
import { fetchJson } from "@/lib/ipfs";
import type { T } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_LABEL, tenderMetadataSchema, type Category } from "@/lib/metadata";
import { nftAuctionEnabled } from "@/lib/nft-hooks";
import { cn } from "@/lib/utils";
import { NETWORK_NAME } from "@/lib/network";

type SortKey = "deadline" | "newest" | "bids";
const NFT_TAB = "NFT";
const stateFilters = (t: T) => [
  { value: "active", label: t("Active (Open + Reveal)", "Đang hoạt động (Mở + Công bố)") },
  { value: "all", label: t("All states", "Mọi trạng thái") },
  ...[TenderState.Open, TenderState.Reveal, TenderState.Evaluation, TenderState.Awarded, TenderState.Failed, TenderState.Cancelled].map(
    (s) => ({ value: String(s), label: t(STATE_LABEL[s]) }),
  ),
];

export default function MarketplacePage() {
  const { rows, isLoading, error } = useTenders();
  const [category, setCategory] = useState<string>("All");
  const [stateFilter, setStateFilter] = useState("active");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [query, setQuery] = useState("");
  const t = useT();

  // /marketplace?type=nft opens the NFT tab (read once on mount; useSearchParams would need a Suspense boundary).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("type") === "nft") setCategory(NFT_TAB);
  }, []);

  function selectCategory(c: string) {
    setCategory(c);
    const url = new URL(window.location.href);
    if (c === NFT_TAB) url.searchParams.set("type", "nft");
    else url.searchParams.delete("type");
    window.history.replaceState(null, "", url);
  }

  // Same query keys as TenderCard, so metadata is fetched once and shared.
  const metas = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["tender-metadata", r.tender.metadataURI],
      queryFn: async () => tenderMetadataSchema.parse(await fetchJson(r.tender.metadataURI)),
      staleTime: Infinity,
      retry: 1,
    })),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows
      .map((row, i) => ({ row, meta: metas[i]?.data }))
      .filter(({ row, meta }) => {
        if (category !== "All" && meta?.category !== category) return false;
        if (stateFilter === "active" && row.state !== TenderState.Open && row.state !== TenderState.Reveal) return false;
        if (stateFilter !== "active" && stateFilter !== "all" && row.state !== Number(stateFilter)) return false;
        if (q && !`${meta?.title ?? ""} ${meta?.description ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      });
    const deadline = (r: (typeof list)[number]["row"]) =>
      r.state === TenderState.Open ? r.tender.submissionDeadline : r.tender.revealDeadline;
    return list.sort((a, b) => {
      if (sort === "newest") return a.row.id > b.row.id ? -1 : 1;
      if (sort === "bids") return b.row.tender.bidCount - a.row.tender.bidCount;
      return deadline(a.row) < deadline(b.row) ? -1 : 1;
    });
  }, [rows, metas, category, stateFilter, sort, query]);

  const isNft = category === NFT_TAB;
  const tabClass = (on: boolean) =>
    cn(
      "inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
      on && "bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tint)_12%,transparent)]",
    );

  return (
    <>
      <PageHeader
        eyebrow={`${isNft ? t("NFT auctions", "Đấu giá NFT") : t("Tender directory", "Danh mục gói thầu")} · ${NETWORK_NAME}`}
        title={t("Marketplace", "Sàn thầu")}
        description={
          isNft
            ? nftAuctionEnabled
              ? t(
                  "Sealed-bid auctions for ERC-721 NFTs on PortaldotV3. Collectors bid in tPOTv3 and prices stay sealed until bidding ends.",
                  "Đấu giá kín cho NFT ERC-721 trên PortaldotV3. Nhà sưu tầm đặt giá bằng tPOTv3 và giá được niêm phong đến khi hết hạn đặt giá.",
                )
              : t(
                  "Coming soon: sealed-bid auctions for ERC-721 NFTs on PortaldotV3, built on the same commit–reveal engine as tenders.",
                  "Sắp ra mắt: đấu giá kín cho NFT ERC-721 trên PortaldotV3, dùng cùng cơ chế commit–reveal với gói thầu.",
                )
            : t(
                "Public tenders any wallet except the buyer can bid on. Budgets are public — bid amounts stay sealed until the submission deadline.",
                "Gói thầu công khai, mọi ví trừ bên mời thầu đều có thể dự thầu. Ngân sách công khai — giá thầu được niêm phong đến hạn nộp hồ sơ.",
              )
        }
        actions={
          <Button asChild>
            {isNft ? (
              nftAuctionEnabled ? (
                <Link href="/nft/list">
                  <Plus /> {t("List NFT", "Đăng bán NFT")}
                </Link>
              ) : (
                <Link href="/nft">
                  <Gem /> {t("NFT roadmap", "Lộ trình NFT")}
                </Link>
              )
            ) : (
              <Link href="/tenders/new">
                <Plus /> {t("Create tender", "Tạo gói thầu")}
              </Link>
            )}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label={t("Category", "Danh mục")}>
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} role="tab" aria-selected={category === c} onClick={() => selectCategory(c)} className={tabClass(category === c)}>
            {c === "All" ? t("All", "Tất cả") : t(CATEGORY_LABEL[c as Category])}
          </button>
        ))}
        {/* NFTs are auctions, not tenders: kept apart from the tender categories, with their own filters. */}
        <span className="flex items-center gap-2" role="presentation">
          <span className="mx-1 hidden h-5 w-px bg-overlay/15 sm:block" aria-hidden="true" />
          <button role="tab" aria-selected={isNft} onClick={() => selectCategory(NFT_TAB)} className={tabClass(isNft)}>
            <Gem className="size-3.5" /> NFT
          </button>
        </span>
      </div>

      {isNft ? (
        nftAuctionEnabled ? <AuctionBrowser /> : <NftComingSoonNotice />
      ) : (
        <ConfigGate>
          <div className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("Search tenders", "Tìm gói thầu")} value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full pl-9" />
            </div>
            <SelectMenu ariaLabel={t("State", "Trạng thái")} value={stateFilter} onValueChange={setStateFilter} options={stateFilters(t)} className="sm:w-56" />
            <SelectMenu
              ariaLabel={t("Sort", "Sắp xếp")}
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
              options={[
                { value: "deadline", label: t("Deadline soonest", "Hạn gần nhất") },
                { value: "newest", label: t("Newest", "Mới nhất") },
                { value: "bids", label: t("Most bids", "Nhiều hồ sơ nhất") },
              ]}
              className="sm:w-48"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{t("Could not load tenders:", "Không tải được gói thầu:")} {error.message}</p>
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-60" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title={t("No tenders match these filters", "Không có gói thầu nào khớp bộ lọc")}>
              {t("Try another category or state, or publish the first tender.", "Hãy thử danh mục hoặc trạng thái khác, hoặc đăng gói thầu đầu tiên.")}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(({ row }) => (
                <TenderCard key={row.id.toString()} row={row} />
              ))}
            </div>
          )}
        </ConfigGate>
      )}
    </>
  );
}
