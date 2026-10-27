"use client";

import { useQueries } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { useT } from "@/components/lang-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuctionState } from "@/lib/nft-auction";
import { useAuctionTokenURIs, useAuctions } from "@/lib/nft-hooks";
import { fetchNftMetadata } from "@/lib/nft-metadata";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { AuctionCard } from "./auction-card";

const TABS = [
  { value: "live", label: ["Live", "Đang diễn ra"], match: (s: AuctionState) => s === AuctionState.Open || s === AuctionState.Reveal },
  { value: "ended", label: ["Ended", "Đã kết thúc"], match: (s: AuctionState) => s >= AuctionState.Settlement },
  { value: "all", label: ["All", "Tất cả"], match: () => true },
] as const;

type SortKey = "ending" | "newest" | "bids";

/** NFT auction list with its own filters (status, search, sort). Used by /nft and the Marketplace "NFT" tab. */
export function AuctionBrowser() {
  const { rows, isLoading, error } = useAuctions();
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("live");
  const [sort, setSort] = useState<SortKey>("ending");
  const [query, setQuery] = useState("");
  const tr = useT();

  // Names for search. Same query key as NftMedia/AuctionCard, so metadata is fetched once and shared.
  const uris = useAuctionTokenURIs(rows);
  const metas = useQueries({
    queries: uris.map((uri) => ({ queryKey: ["nft-metadata", uri], queryFn: () => fetchNftMetadata(uri!), enabled: !!uri, staleTime: Infinity, retry: 1 })),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = TABS.find((t) => t.value === tab)!.match;
    const ends = (r: (typeof rows)[number]) => (r.state === AuctionState.Open ? r.auction.bidDeadline : r.auction.revealDeadline);
    return rows
      .map((row, i) => ({ row, name: metas[i]?.data?.name ?? "" }))
      .filter(({ row, name }) => match(row.state) && (!q || `${name} #${row.auction.tokenId} ${row.auction.collection}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === "newest") return a.row.id > b.row.id ? -1 : 1;
        if (sort === "bids") return b.row.auction.bidCount - a.row.auction.bidCount;
        return ends(a.row) < ends(b.row) ? -1 : 1;
      });
  }, [rows, metas, tab, sort, query]);

  return (
    <>
      <div className="mb-6 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="flex gap-2" role="tablist" aria-label={tr("Auction status", "Trạng thái đấu giá")}>
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "min-h-[34px] rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
                tab === t.value && "bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tint)_12%,transparent)]",
              )}
            >
              {tr(t.label[0], t.label[1])}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={tr("Search by name, token id or collection", "Tìm theo tên, token id hoặc bộ sưu tập")} value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full pl-9" />
        </div>
        <SelectMenu
          ariaLabel={tr("Sort", "Sắp xếp")}
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          options={[
            { value: "ending", label: tr("Ending soonest", "Sắp kết thúc") },
            { value: "newest", label: tr("Newest", "Mới nhất") },
            { value: "bids", label: tr("Most bids", "Nhiều lượt đặt giá nhất") },
          ]}
          className="sm:w-48"
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {tr("Could not load auctions:", "Không tải được phiên đấu giá:")} {error.message}
        </p>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tab === "live" ? tr("No live auctions", "Chưa có phiên đấu giá nào đang diễn ra") : tr("No auctions match", "Không có phiên đấu giá nào khớp")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/nft/list">{tr("List the first NFT", "Đăng bán NFT đầu tiên")}</Link>
            </Button>
          }
        >
          {tr(
            `Own an ERC-721 on ${NETWORK_NAME}? List it and collectors can start bidding.`,
            `Bạn có ERC-721 trên ${NETWORK_NAME}? Đăng bán để nhà sưu tầm bắt đầu đặt giá.`,
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ row }) => (
            <AuctionCard key={row.id.toString()} row={row} />
          ))}
        </div>
      )}
    </>
  );
}
