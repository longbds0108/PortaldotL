"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpRight, Clock, FileLock2, Gavel, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount, useBalance } from "wagmi";
import { BidColumns, Gauge, MeterRow, PHASES, PhaseLegend, StackBar, phaseOf, pct, type PhaseKey } from "@/components/dashboard/charts";
import { ConfigGate } from "@/components/gates";
import { Card } from "@/components/ui/card";
import { SelectMenu } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_LABEL, TenderState, type Bid } from "@/lib/contracts";
import { formatDateTime, formatNativeWei, formatNativeWeiFloor, shortAddress } from "@/lib/format";
import { useChainNow, useMyBidTenderIds, useMyLockedBonds, useMyTenderIds, useTenders, type TenderRow } from "@/lib/hooks";
import { fetchJson } from "@/lib/ipfs";
import { CATEGORIES, tenderMetadataSchema, type TenderMetadata } from "@/lib/metadata";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

const DAY = 86_400;
type Item = { row: TenderRow; meta?: TenderMetadata };

/** Metadata (title, category) from IPFS — same query keys as TenderCard, so it is fetched once and shared. */
function useMetadata(rows: TenderRow[]) {
  const metas = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["tender-metadata", r.tender.metadataURI],
      queryFn: async () => tenderMetadataSchema.parse(await fetchJson(r.tender.metadataURI)),
      staleTime: Infinity,
      retry: 1,
    })),
  });
  return { metas: metas.map((m) => m.data), isLoading: metas.some((m) => m.isLoading) };
}

export default function DashboardPage() {
  const now = useChainNow();
  const [category, setCategory] = useState("all");

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Hedgora · {NETWORK_NAME}</p>
          <h1 className="title-sheen mt-2 text-[clamp(2rem,4.4vw,2.9rem)]">Dashboard</h1>
          <p className="mt-1 text-[0.86rem] text-muted-foreground">Live figures read from the Hedgora contract — no estimates.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            ariaLabel="Category"
            value={category}
            onValueChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
            className="h-10 w-[11.5rem]"
          />
          <span className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#211c26] px-4 text-[0.78rem] text-[#d6d1d9]">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Chain time</span>
            <span className="tabular-nums">{now ? formatDateTime(now) : "…"}</span>
          </span>
        </div>
      </header>

      <ConfigGate>
        <Market category={category} now={now} />
      </ConfigGate>
    </div>
  );
}

function Market({ category, now }: { category: string; now: number | undefined }) {
  const market = useTenders();
  const { metas, isLoading: metaLoading } = useMetadata(market.rows);

  const items: Item[] = useMemo(
    () =>
      market.rows
        .map((row, i) => ({ row, meta: metas[i] }))
        .filter((it) => category === "all" || it.meta?.category === category),
    [market.rows, metas, category],
  );
  // A category filter needs every tender's metadata before its counts are final.
  const ready = !market.isLoading && (category === "all" || !metaLoading);

  const s = useMemo(() => {
    const by: Record<PhaseKey, number> = { open: 0, reveal: 0, evaluation: 0, awarded: 0, closed: 0 };
    let bids = 0;
    let revealed = 0;
    let failed = 0;
    let cancelled = 0;
    const open = { lt1d: 0, lt7d: 0, later: 0 };
    let revealEnding = 0;
    for (const { row } of items) {
      by[phaseOf(row.state)]++;
      bids += row.tender.bidCount;
      revealed += row.tender.revealedCount;
      if (row.state === TenderState.Failed) failed++;
      if (row.state === TenderState.Cancelled) cancelled++;
      if (now === undefined) continue;
      if (row.state === TenderState.Open) {
        const left = Number(row.tender.submissionDeadline) - now;
        if (left <= DAY) open.lt1d++;
        else if (left <= 7 * DAY) open.lt7d++;
        else open.later++;
      }
      if (row.state === TenderState.Reveal && Number(row.tender.revealDeadline) - now <= DAY) revealEnding++;
    }
    return { by, total: items.length, bids, revealed, failed, cancelled, open, revealEnding };
  }, [items, now]);

  const v = (n: number) => (ready ? n : "…");
  const wallet = useWalletData();

  if (market.error) return <p className="text-sm text-destructive">Could not load tenders: {market.error.message}</p>;

  // Oldest → newest, last 10, for the activity chart.
  const columns = [...items]
    .sort((a, b) => (a.row.id < b.row.id ? -1 : 1))
    .slice(-10)
    .map(({ row, meta }) => ({
      id: row.id,
      title: meta?.title,
      bids: row.tender.bidCount,
      revealed: row.tender.revealedCount,
      phase: phaseOf(row.state),
    }));

  return (
    <div className="space-y-5">
      <WalletKpis wallet={wallet} />

      <section className="grid gap-2.5">
        <RowLabel>Marketplace · all wallets{category !== "all" ? ` · ${category}` : ""}</RowLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            tone="blue"
            href="/marketplace"
            label="Total tenders"
            value={v(s.total)}
            hint={ready ? `${s.bids} sealed bid${s.bids === 1 ? "" : "s"} across them` : "Reading the chain…"}
          />
          <Kpi
            tone="blue"
            href="/marketplace"
            label="Awarded"
            value={v(s.by.awarded)}
            hint={ready ? `${s.failed} failed · ${s.cancelled} cancelled` : "…"}
          />
          <Kpi
            tone="teal"
            href="/marketplace"
            label="Open for bids"
            value={v(s.by.open)}
            hint={ready && now !== undefined ? `${s.open.lt1d} closing within 24h` : "…"}
          />
          <Kpi
            tone="amber"
            href="/marketplace"
            label="Awaiting award"
            value={v(s.by.evaluation)}
            hint={ready ? `${s.by.reveal} still in the reveal window` : "…"}
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Panel
          title="Bid activity"
          aside={<span className="text-[0.7rem] text-muted-foreground">Sealed bids per tender · latest {columns.length || ""}</span>}
        >
          {!ready ? (
            <Skeleton className="h-[230px]" />
          ) : columns.length === 0 ? (
            <Empty>No tenders{category !== "all" ? ` in ${category}` : ""} yet.</Empty>
          ) : (
            <>
              <BidColumns columns={columns} />
              <div className="mt-4">
                <PhaseLegend />
              </div>
            </>
          )}
        </Panel>

        <Panel>
          {!ready || now === undefined ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="grid content-start gap-3.5">
                <h2 className="text-[0.9rem] text-[#f1eef5]">By phase</h2>
                {PHASES.map((p) => (
                  <MeterRow key={p.key} label={p.label.replace(" · sealed", "")} count={s.by[p.key]} total={s.total} color={p.color} />
                ))}
              </div>
              <div className="grid content-start gap-3.5">
                <h2 className="text-[0.9rem] text-[#f1eef5]">Deadlines ahead</h2>
                <MeterRow label="Submission < 24h" count={s.open.lt1d} total={s.by.open} color="#e5484d" />
                <MeterRow label="Submission 1–7 days" count={s.open.lt7d} total={s.by.open} color="#e8b54c" />
                <MeterRow label="Submission > 7 days" count={s.open.later} total={s.by.open} color="#4fd1c5" />
                <MeterRow label="Reveal ends < 24h" count={s.revealEnding} total={s.by.reveal} color="#83aaff" />
                <p className="text-[0.66rem] leading-relaxed text-muted-foreground">Shares of open / in-reveal tenders, by chain time.</p>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr_0.95fr]">
        <MyActivity wallet={wallet} />

        <Panel title="Tenders by category">
          {!ready || metaLoading ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <div className="grid gap-4">
              {(category === "all" ? CATEGORIES : [category]).map((c) => {
                const rows = items.filter((it) => it.meta?.category === c);
                const count = (k: PhaseKey) => rows.filter((it) => phaseOf(it.row.state) === k).length;
                return (
                  <div key={c} className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
                      <span className="text-[#f1eef5]">{c}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {rows.length} tender{rows.length === 1 ? "" : "s"} · {pct(count("awarded"), rows.length)}% awarded
                      </span>
                    </div>
                    <StackBar parts={PHASES.map((p) => ({ phase: p.key, count: count(p.key) }))} />
                  </div>
                );
              })}
              <div className="pt-1">
                <PhaseLegend />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Award rate">
          {!ready ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <div className="grid gap-5 pt-2">
              <Gauge
                value={s.total ? `${pct(s.by.awarded, s.total)}%` : "—"}
                caption="of tenders awarded"
                segments={[
                  { key: "awarded", count: s.by.awarded, color: "#3f7be0" },
                  { key: "progress", count: s.by.open + s.by.reveal + s.by.evaluation, color: "#83aaff" },
                  { key: "closed", count: s.by.closed, color: "#e5484d", hatch: true },
                ]}
              />
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[0.68rem] text-muted-foreground">
                <Legend color="#3f7be0">Awarded · {s.by.awarded}</Legend>
                <Legend color="#83aaff">In progress · {s.by.open + s.by.reveal + s.by.evaluation}</Legend>
                <Legend color="#e5484d" hatch>
                  No award · {s.by.closed}
                </Legend>
              </ul>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

// ───────────────────────── this wallet ─────────────────────────

type Activity = { row: TenderRow; role: "buyer" | "bidder"; bid?: Bid };
type WalletData = ReturnType<typeof useWalletData>;

/** Everything shown about the connected wallet — read from the chain, nothing derived from guesses. */
function useWalletData() {
  const { address, isConnected } = useAccount();
  const myTenderIds = useMyTenderIds();
  const myBidIds = useMyBidTenderIds();
  const myTenders = useTenders(myTenderIds.data ?? []);
  const myBidTenders = useTenders(myBidIds.data ?? []);
  // Native USDC on Arc has 18 decimals (same balance as the 6-decimal ERC-20 view). Pinned to Arc so a wallet
  // sitting on another network never shows that network's balance here.
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: !!address, refetchInterval: 15_000 } });
  const bonds = useMyLockedBonds(myBidTenders.rows);

  const tendersReady = myTenderIds.data !== undefined && !myTenders.isLoading;
  const bidsReady = myBidIds.data !== undefined && !myBidTenders.isLoading && !(bonds.isLoading && myBidTenders.rows.length > 0);
  const list: Activity[] = [
    ...myTenders.rows.map((row) => ({ row, role: "buyer" as const })),
    ...myBidTenders.rows.map((row) => ({ row, role: "bidder" as const, bid: bonds.bids.get(row.id) })),
  ].sort((a, b) => (a.row.id > b.row.id ? -1 : a.row.id < b.row.id ? 1 : 0));

  return {
    address,
    isConnected,
    balance,
    bonds,
    tendersReady,
    bidsReady,
    list,
    tenderCount: myTenderIds.data?.length,
    bidCount: myBidIds.data?.length,
    awaitingMyAward: myTenders.rows.filter((r) => r.state === TenderState.Evaluation).length,
    toReveal: myBidTenders.rows.filter((r) => r.state === TenderState.Reveal && bonds.bids.get(r.id)?.revealed === false).length,
  };
}

function WalletKpis({ wallet: w }: { wallet: WalletData }) {
  if (!w.isConnected) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[20px] border border-dashed border-white/12 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <span className="empty-orb size-10 rounded-[12px]">
            <Wallet className="size-4" />
          </span>
          <div>
            <p className="text-[0.88rem] text-[#f1eef5]">Your wallet</p>
            <p className="text-[0.74rem] text-muted-foreground">Connect to see its USDC balance, locked bonds, tenders and bids.</p>
          </div>
        </div>
        <ConnectButton showBalance={false} chainStatus="none" />
      </section>
    );
  }
  const bal = w.balance.data ? formatNativeWeiFloor(w.balance.data.value) : w.balance.isError ? "—" : "…";
  return (
    <section className="grid gap-2.5">
      <RowLabel>Your wallet · {shortAddress(w.address)}</RowLabel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi featured href="/profile" label="USDC balance" value={bal} hint={w.balance.isError ? "Balance unavailable" : `Native USDC · ${NETWORK_NAME}`} />
        <Kpi
          tone="blue"
          href="/my/bids"
          label="Locked in bid bonds"
          value={w.bidsReady ? formatNativeWei(w.bonds.lockedWei) : "…"}
          hint={w.bidsReady ? (w.bonds.count ? `${w.bonds.count} bond${w.bonds.count > 1 ? "s" : ""} · back after reveal` : "No active bonds") : "…"}
        />
        <Kpi
          tone="teal"
          href="/my/tenders"
          label="My tenders"
          value={w.tenderCount ?? "…"}
          hint={w.tendersReady ? `${w.awaitingMyAward} awaiting your award` : "…"}
        />
        <Kpi
          tone="amber"
          href="/my/bids"
          label="My bids"
          value={w.bidCount ?? "…"}
          hint={w.bidsReady ? `${w.toReveal} to reveal now` : "…"}
        />
      </div>
    </section>
  );
}

function MyActivity({ wallet: w }: { wallet: WalletData }) {
  const { list, isConnected } = w;
  const { metas } = useMetadata(list.map((a) => a.row));
  const loading = !w.tendersReady || !w.bidsReady;

  return (
    <Panel
      title="My activity"
      aside={
        isConnected && (
          <Link
            href="/tenders/new"
            className="flex h-8 items-center gap-1 rounded-full border border-white/15 px-3 text-[0.72rem] text-[#f1eef5] transition-colors hover:border-[rgba(131,170,255,.5)] hover:text-[#c3d6ff]"
          >
            <Plus className="size-3.5" /> New tender
          </Link>
        )
      }
    >
      {!isConnected ? (
        <Empty>Connect a wallet to list its tenders and bids.</Empty>
      ) : loading ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <Empty>No tenders or bids from this wallet yet.</Empty>
      ) : (
        <div className="grid gap-3">
          <ul className="grid gap-1">
            {list.slice(0, 6).map((a, i) => (
              <ActivityRow key={`${a.role}-${a.row.id}`} activity={a} title={metas[i]?.title} />
            ))}
          </ul>
          {list.length > 6 && (
            <div className="flex gap-4 text-[0.72rem]">
              <Link href="/my/tenders" className="text-[#d6d1d9] hover:text-[#c3d6ff]">
                All my tenders →
              </Link>
              <Link href="/my/bids" className="text-[#d6d1d9] hover:text-[#c3d6ff]">
                All my bids →
              </Link>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ActivityRow({ activity: { row, role, bid }, title }: { activity: Activity; title?: string }) {
  const { state, tender, id } = row;
  const revealClosed = state !== TenderState.Open && state !== TenderState.Reveal;
  const chips: { text: string; tone: Tone }[] = [];
  if (role === "buyer") {
    if (state === TenderState.Evaluation) chips.push({ text: "Award due", tone: "amber" });
  } else if (bid) {
    if (state === TenderState.Reveal && !bid.revealed) chips.push({ text: "Reveal now", tone: "red" });
    else if (revealClosed && !bid.revealed && bid.bond > 0n) chips.push({ text: "Bond forfeited", tone: "red" });
    else if (revealClosed && bid.revealed && bid.bond > 0n && !bid.bondWithdrawn) chips.push({ text: "Bond to withdraw", tone: "amber" });
  }
  chips.push({ text: STATE_LABEL[state], tone: STATE_TONE[state] });

  const Icon = role === "buyer" ? Gavel : FileLock2;
  const sub =
    role === "buyer"
      ? `Buyer · ${tender.bidCount} bid${tender.bidCount === 1 ? "" : "s"}`
      : `Bidder · ${bid?.revealed ? "revealed" : "sealed"}`;
  const href = role === "buyer" && state === TenderState.Evaluation ? `/tenders/${id}/evaluate` : role === "bidder" ? "/my/bids" : `/tenders/${id}`;

  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-[14px] px-2 py-2 transition-colors hover:bg-white/[0.04]">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border",
            role === "buyer" ? "border-[rgba(131,170,255,.3)] bg-[rgba(11,83,191,.22)] text-[#c3d6ff]" : "border-[rgba(232,227,213,.2)] bg-[rgba(232,227,213,.08)] text-[#f3efe5]",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.82rem] text-[#f1eef5]">{title ?? `Tender #${id}`}</span>
          <span className="block truncate text-[0.68rem] text-muted-foreground">
            #{id.toString()} · {sub}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {chips.map((c) => (
            <Chip key={c.text} tone={c.tone}>
              {c.text}
            </Chip>
          ))}
        </span>
      </Link>
    </li>
  );
}

// ───────────────────────── building blocks ─────────────────────────

type Tone = "teal" | "amber" | "blue" | "red" | "muted";
const STATE_TONE: Record<TenderState, Tone> = {
  [TenderState.Open]: "teal",
  [TenderState.Reveal]: "amber",
  [TenderState.Evaluation]: "blue",
  [TenderState.Awarded]: "blue",
  [TenderState.Cancelled]: "muted",
  [TenderState.Failed]: "red",
};
const CHIP: Record<Tone, string> = {
  teal: "bg-[rgba(79,209,197,.12)] text-[#8fe0d6]",
  amber: "bg-[rgba(232,181,76,.14)] text-[#ecc979]",
  blue: "bg-[rgba(131,170,255,.14)] text-[#c3d6ff]",
  red: "bg-[rgba(229,72,77,.15)] text-[#f08a8d]",
  muted: "bg-white/[0.06] text-muted-foreground",
};

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[0.62rem] font-medium", CHIP[tone])}>{children}</span>;
}

const KPI_TONE = {
  blue: "bg-[radial-gradient(circle_at_100%_0,rgba(131,170,255,.16),transparent_55%),#18151d]",
  teal: "bg-[radial-gradient(circle_at_100%_0,rgba(79,209,197,.13),transparent_55%),#18151d]",
  amber: "bg-[radial-gradient(circle_at_100%_0,rgba(232,181,76,.13),transparent_55%),#18151d]",
};

function Kpi({
  label,
  value,
  hint,
  featured,
  tone = "blue",
  href,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint: string;
  featured?: boolean;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative grid min-h-[132px] content-between gap-3 overflow-hidden rounded-[20px] border p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5",
        featured
          ? "border-[rgba(131,170,255,.35)] bg-[radial-gradient(circle_at_100%_0,rgba(207,226,255,.28),transparent_50%),linear-gradient(150deg,#1f62d0,#0b3f93)] shadow-[0_18px_40px_rgba(11,83,191,.28)]"
          : cn("border-white/[0.08]", KPI_TONE[tone]),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-[0.78rem]", featured ? "text-white/85" : "text-[#b9b3bf]")}>{label}</span>
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full transition-transform group-hover:rotate-45",
            featured ? "bg-white text-[#0b3f93]" : "border border-white/10 bg-white/[0.04] text-[#d6d1d9]",
          )}
        >
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
      <strong className={cn("text-[clamp(1.8rem,3vw,2.35rem)] font-normal leading-none tracking-[-0.05em] tabular-nums", featured && "text-white")}>
        {value}
      </strong>
      <small className={cn("truncate text-[0.68rem]", featured ? "text-white/75" : "text-muted-foreground")}>{hint}</small>
    </Link>
  );
}

function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="relative z-[1]">
        {(title || aside) && (
          <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2">
            {title && <h2 className="text-[1rem] tracking-[-0.02em] text-[#f5f3f7]">{title}</h2>}
            {aside}
          </div>
        )}
        {children}
      </div>
    </Card>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

function Legend({ color, hatch, children }: { color: string; hatch?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <i
        aria-hidden="true"
        className={cn("inline-block size-2.5 rounded-full", hatch && "hatch")}
        style={hatch ? ({ "--hatch": color, boxShadow: `inset 0 0 0 1px ${color}` } as CSSProperties) : { background: color }}
      />
      {children}
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] border border-dashed border-white/10 px-4 py-8 text-center text-[0.8rem] text-muted-foreground">{children}</p>;
}
