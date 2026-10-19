"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, Download, FileText, Gem, Info, Users, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { usePublicClient } from "wagmi";
import { Gauge, MeterRow, PHASES, PhaseLegend, StackBar } from "@/components/dashboard/charts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RANGES, analyticsJson, computeAnalytics, eventsCsv, type Analytics, type Range } from "@/lib/analytics";
import { formatNativeAmount } from "@/lib/format";
import { useChainNow } from "@/lib/hooks";
import { loadMarketSnapshot } from "@/lib/market-data";
import { NETWORK_NAME } from "@/lib/network";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";

// Validated (dataviz validate_palette): in-band and >= 3:1 on dark; 2.96:1 on light, relieved by visible values + table.
const ACCENT = "#5b8def";
const PHASE_COLOR = Object.fromEntries(PHASES.map((p) => [p.key, p.color])) as Record<(typeof PHASES)[number]["key"], string>;

export function useMarketSnapshot() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => loadMarketSnapshot(client!),
    enabled: !!client,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Fees can be far below 0.01 tPOTv3; say so instead of printing 0.00. */
const feeText = (v: bigint | undefined) => (v === undefined ? "—" : v > 0n && v < 10n ** 16n ? "< 0.01 tPOTv3" : formatNativeAmount(v));

const pctText = (r: number | undefined) => (r === undefined ? "—" : `${Math.round(r * 100)}%`);

export function AnalyticsPage() {
  const snap = useMarketSnapshot();
  const now = useChainNow();
  const [range, setRange] = useState<Range>(30);
  const a = useMemo(() => (snap.data && now !== undefined ? computeAnalytics(snap.data, range, now) : undefined), [snap.data, range, now]);

  function exportAs(kind: "csv" | "json") {
    if (!a || !snap.data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const label = range === 0 ? "all" : `${range}d`;
    if (kind === "csv") downloadTextFile(`plinths-activity-${label}-${stamp}.csv`, eventsCsv(a.events));
    else downloadTextFile(`plinths-analytics-${label}-${stamp}.json`, analyticsJson(a, { range, generatedAt: new Date().toISOString(), head: snap.data.head.number, blockTime: snap.data.blockTime }));
  }

  return (
    <>
      <PageHeader
        eyebrow={`Proof of Fairness · ${NETWORK_NAME}`}
        title="Analytics"
        description="Market-wide numbers for tenders and NFT auctions, computed in your browser from public on-chain data. Sealed prices never appear here before they are revealed."
        actions={
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={range === r.value}
                  onClick={() => setRange(r.value)}
                  className={cn(
                    "inline-flex min-h-[34px] items-center rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
                    range === r.value && "border-transparent bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={!a} onClick={() => exportAs("csv")}>
              <Download /> CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!a} onClick={() => exportAs("json")}>
              <Download /> JSON
            </Button>
          </>
        }
      />

      {snap.error ? (
        <p className="text-sm text-destructive">Could not read the contracts: {snap.error.message}</p>
      ) : !a || !snap.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[104px]" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <Dashboard a={a} blockTime={snap.data.blockTime} head={snap.data.head.number} />
      )}
    </>
  );
}

function Dashboard({ a, blockTime, head }: { a: Analytics; blockTime: number; head: bigint }) {
  const t = a.tender;
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 text-[0.72rem] text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Data as of block #{head.toString()}. The RPC only keeps recent blocks, so event times are estimated from block numbers (~
        {blockTime.toFixed(1)} s per block).
      </p>

      <Section label="Overview">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={FileText} label="Tenders" value={a.overview.tenders} hint="Published in this period" />
          <Kpi icon={Gem} label="NFT auctions" value={a.overview.auctions} hint="Listed in this period" />
          <Kpi icon={Users} label="Wallets" value={a.overview.wallets} hint="Took part in this period" />
          <Kpi icon={ArrowLeftRight} label="Transactions" value={a.overview.transactions} hint="Successful contract calls" />
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tender analytics" subtitle={`${t.total} tender${t.total === 1 ? "" : "s"} published in this period`}>
          <div className="grid gap-4">
            <StackBar
              parts={[
                { phase: "awarded", count: t.awarded },
                { phase: "evaluation", count: t.evaluating },
                { phase: "reveal", count: t.reveal },
                { phase: "open", count: t.open },
                { phase: "closed", count: t.failed + t.cancelled },
              ]}
            />
            <PhaseLegend />
            <div className="grid gap-3.5 border-t border-overlay/[0.06] pt-4">
              <MeterRow label="Received at least one bid" count={t.withBids} total={t.total} color={ACCENT} />
              <MeterRow label="Sealed bids revealed" count={t.revealedBids} total={t.sealedBids} color={PHASE_COLOR.reveal} />
              <MeterRow label="Awarded (of finished, not cancelled)" count={t.awarded} total={t.finished - t.cancelled} color={PHASE_COLOR.awarded} />
              <MeterRow label="Cancelled" count={t.cancelled} total={t.total} color={PHASE_COLOR.closed} />
            </div>
          </div>
        </Panel>

        <Panel title="NFT auction analytics" subtitle={`${a.nft.total} auction${a.nft.total === 1 ? "" : "s"} listed in this period`}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Bidders" value={a.nft.bidders} />
            <Mini label="Sealed bids" value={a.nft.bids} />
            <Mini label="Avg bids" value={a.nft.avgBids === undefined ? "—" : a.nft.avgBids.toFixed(1)} />
            <Mini label="Volume" value={formatNativeAmount(a.nft.volume)} wide />
          </div>
          <div className="mt-4 grid gap-3.5 border-t border-overlay/[0.06] pt-4">
            <MeterRow label="Live (bidding or revealing)" count={a.nft.live} total={a.nft.total} color={PHASE_COLOR.open} />
            <MeterRow label="Sold" count={a.nft.sold} total={a.nft.total} color={PHASE_COLOR.awarded} />
            <MeterRow label="Waiting for settlement" count={a.nft.awaitingSettle} total={a.nft.total} color={PHASE_COLOR.reveal} />
            <MeterRow label="No sale or cancelled" count={a.nft.noSale + a.nft.cancelled} total={a.nft.total} color={PHASE_COLOR.closed} />
          </div>
        </Panel>
      </div>

      <Panel title="Transaction analytics" subtitle="Successful calls per day, by type, and the gas they paid">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <DailyColumns daily={a.daily} />
          <div className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Mini label="Avg fee" value={feeText(a.tx.avgFee)} wide />
              <Mini label="Avg gas" value={a.tx.avgGas === undefined ? "—" : a.tx.avgGas.toLocaleString()} wide />
            </div>
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Gas known for {a.tx.gasKnown} of {a.tx.total} transactions (the RPC only serves recent receipts). Failed calls
              leave no events, so they are not counted here.
            </p>
            <ul className="grid gap-1.5 text-[0.76rem]">
              {a.tx.byType.length === 0 && <li className="text-muted-foreground">No transactions in this period.</li>}
              {a.tx.byType.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
                  <span className="text-foreground-soft">{r.label}</span>
                  <span className="tabular-nums text-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Participant analytics" subtitle="Unique wallets that took part in this period">
          <div className="grid grid-cols-3 gap-3">
            <Mini label="Unique wallets" value={a.participants.unique} />
            <Mini label="New" value={a.participants.newcomers} />
            <Mini label="Returning" value={a.participants.returning} />
          </div>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">Returning = active before this period, or in two or more tenders / auctions.</p>
          <div className="mt-4 grid gap-3.5 border-t border-overlay/[0.06] pt-4">
            <MeterRow label="Buyers (published a tender)" count={a.participants.buyers} total={a.participants.unique} color={ACCENT} />
            <MeterRow label="Bidders (tenders or NFTs)" count={a.participants.bidders} total={a.participants.unique} color={PHASE_COLOR.evaluation} />
            <MeterRow label="NFT sellers" count={a.participants.sellers} total={a.participants.unique} color={PHASE_COLOR.open} />
          </div>
        </Panel>

        <Panel title="Settlement analytics" subtitle="Tenders and auctions that reached the end of their process">
          <div className="grid items-center gap-5 sm:grid-cols-[1fr_1.1fr]">
            <Gauge
              segments={[
                { key: "done", count: a.settlement.completed, color: PHASE_COLOR.awarded },
                { key: "pending", count: a.settlement.pending, color: "#b07a1f" }, // validated pair with awarded blue (dark + light)
              ]}
              value={pctText(a.settlement.completionRate)}
              caption="completed"
            />
            <ul className="grid gap-2 text-[0.76rem]">
              <Line label="Completed" value={a.settlement.completed} />
              <Line label="Awaiting award" value={a.settlement.awaitingAward} />
              <Line label="Awaiting settlement" value={a.settlement.awaitingSettle} />
              <Line label="Bonds refunded" value={`${a.settlement.bondRefunds} · ${formatNativeAmount(a.settlement.bondRefunded)}`} />
              <Line label="Deposits & proceeds paid" value={`${a.settlement.depositRefunds} · ${formatNativeAmount(a.settlement.depositRefunded)}`} />
              <Line label="Forfeited bonds to treasury" value={formatNativeAmount(a.settlement.forfeitSwept)} />
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Single series: successful transactions per day. Hover or focus a column for its value. */
function DailyColumns({ daily }: { daily: Analytics["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.txs));
  const [active, setActive] = useState<number>();
  const total = daily.reduce((s, d) => s + d.txs, 0);
  const shown = active !== undefined ? daily[active] : undefined;
  const fmt = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between text-[0.72rem] text-muted-foreground">
        <span>
          <Activity className="mr-1 inline size-3.5 text-link" />
          Transactions per day
        </span>
        <span className="tabular-nums text-foreground">{shown ? `${fmt(shown.day)} · ${shown.txs}` : `${total} in total`}</span>
      </div>
      <div className="flex h-[150px] items-end gap-[2px]" onMouseLeave={() => setActive(undefined)} role="img" aria-label={`Transactions per day, ${total} in total`}>
        {daily.map((d, i) => (
          <button
            key={d.day}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(undefined)}
            aria-label={`${fmt(d.day)}: ${d.txs} transaction${d.txs === 1 ? "" : "s"}`}
            className="group flex h-full min-w-0 flex-1 items-end outline-none"
          >
            <span
              className={cn("w-full rounded-t-[4px] transition-[height,opacity] duration-500", d.txs === 0 && "bg-overlay/[0.07]", active !== undefined && active !== i && "opacity-55")}
              style={{ height: d.txs === 0 ? 2 : `${Math.max(6, (d.txs / max) * 100)}%`, background: d.txs ? ACCENT : undefined }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[0.66rem] text-muted-foreground">
        <span>{daily[0] ? fmt(daily[0].day) : ""}</span>
        <span>{daily.at(-1) ? fmt(daily.at(-1)!.day) : ""}</span>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <p className="eyebrow text-[0.62rem]">{label}</p>
      {children}
    </section>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-[1.05rem] font-medium text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[0.74rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: number; hint: string }) {
  return (
    <div className="well flex flex-col gap-3 rounded-[15px] p-4">
      <span className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
        <Icon className="size-3.5 text-link" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[1.8rem] font-medium leading-none tracking-[-0.03em] text-foreground tabular-nums">{value}</span>
      <span className="text-[0.7rem] text-muted-foreground">{hint}</span>
    </div>
  );
}

function Mini({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("well rounded-[12px] p-3", wide && "col-span-1")}>
      <p className="text-[0.66rem] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[1.05rem] font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-overlay/[0.05] pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums text-foreground">{value}</span>
    </li>
  );
}

