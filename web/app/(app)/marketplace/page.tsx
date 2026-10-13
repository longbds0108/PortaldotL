"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { ConfigGate } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TenderCard } from "@/components/tender-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_LABEL, TenderState } from "@/lib/contracts";
import { useTenders } from "@/lib/hooks";
import { fetchJson } from "@/lib/ipfs";
import { CATEGORIES, tenderMetadataSchema } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { NETWORK_NAME } from "@/lib/network";

type SortKey = "deadline" | "newest" | "bids";
const STATE_FILTERS = [
  { value: "active", label: "Active (Open + Reveal)" },
  { value: "all", label: "All states" },
  ...[TenderState.Open, TenderState.Reveal, TenderState.Evaluation, TenderState.Awarded, TenderState.Failed, TenderState.Cancelled].map(
    (s) => ({ value: String(s), label: STATE_LABEL[s] }),
  ),
];

export default function MarketplacePage() {
  const { rows, isLoading, error } = useTenders();
  const [category, setCategory] = useState<string>("All");
  const [stateFilter, setStateFilter] = useState("active");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [query, setQuery] = useState("");

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

  return (
    <>
      <PageHeader
        eyebrow={`Tender directory · ${NETWORK_NAME}`}
        title="Marketplace"
        description="Public tenders any wallet except the buyer can bid on. Budgets are public — bid amounts stay sealed until the submission deadline."
        actions={
          <Button asChild>
            <Link href="/tenders/new">
              <Plus /> Create tender
            </Link>
          </Button>
        }
      />
      <ConfigGate>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Category">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "min-h-[34px] rounded-full border border-white/10 px-4 text-[0.76rem] text-[#a8a3ae] transition-colors hover:text-foreground",
                category === c && "bg-[rgba(232,227,213,.13)] text-[#f4f0e6] shadow-[inset_0_0_0_1px_rgba(232,227,213,.12)]",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tenders" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full pl-9" />
          </div>
          <SelectMenu ariaLabel="State" value={stateFilter} onValueChange={setStateFilter} options={STATE_FILTERS} className="sm:w-56" />
          <SelectMenu
            ariaLabel="Sort"
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
            options={[
              { value: "deadline", label: "Deadline soonest" },
              { value: "newest", label: "Newest" },
              { value: "bids", label: "Most bids" },
            ]}
            className="sm:w-48"
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive">Could not load tenders: {error.message}</p>
        ) : isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No tenders match these filters">Try another category or state, or publish the first tender.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ row }) => (
              <TenderCard key={row.id.toString()} row={row} />
            ))}
          </div>
        )}
      </ConfigGate>
    </>
  );
}
