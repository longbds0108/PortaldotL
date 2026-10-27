import type { Address, Hash } from "viem";
import { TenderState } from "./contracts";
import { actorsOf, type ChainEvent, type MarketSnapshot } from "./market-data";
import { tenderState } from "./market-storage";
import type { Text } from "./i18n";
import { AuctionState } from "./nft-auction";
import { auctionState } from "./nft-storage";

/*
 * Analytics over a MarketSnapshot. Pure functions: the page passes the snapshot, the time range and chain time.
 * Only public data is used — sealed prices never exist here before they are revealed.
 */

export type Range = 7 | 30 | 90 | 0; // days; 0 = all time
export const RANGES: { value: Range; label: Text }[] = [
  { value: 7, label: ["7 days", "7 ngày"] },
  { value: 30, label: ["30 days", "30 ngày"] },
  { value: 90, label: ["90 days", "90 ngày"] },
  { value: 0, label: ["All time", "Toàn bộ"] },
];

const DAY = 86_400;
export const ratio = (part: number, total: number) => (total > 0 ? part / total : undefined);

const createdAt = (snap: MarketSnapshot, source: "tender" | "nft", id: bigint) =>
  snap.events.find((e) => e.source === source && (e.name === "TenderCreated" || e.name === "AuctionCreated") && idOf(e) === id)?.time;

export function idOf(e: ChainEvent): bigint {
  return "tenderId" in e ? e.tenderId : "auctionId" in e ? e.auctionId : -1n;
}

/** Market a wallet touched: "t:<id>" or "n:<id>". */
const marketKey = (e: ChainEvent) => `${e.source === "tender" ? "t" : "n"}:${idOf(e)}`;

export type Analytics = ReturnType<typeof computeAnalytics>;

export function computeAnalytics(snap: MarketSnapshot, range: Range, nowSec: number) {
  const from = range === 0 ? -Infinity : nowSec - range * DAY;
  const inRange = (t: number | undefined) => t !== undefined && t >= from;
  const events = snap.events.filter((e) => inRange(e.time));

  // ── markets created in the range ──
  const tenders = snap.tenders
    .filter((t) => inRange(createdAt(snap, "tender", t.id)))
    .map((t) => ({ ...t, state: tenderState(t.core, nowSec) }));
  const auctions = snap.auctions
    .filter((a) => inRange(createdAt(snap, "nft", a.id)))
    .map((a) => ({ ...a, state: auctionState(a.core, nowSec) }));

  // ── participants (first seen over all history) ──
  const firstSeen = new Map<string, number>();
  const markets = new Map<string, Set<string>>();
  for (const e of snap.events) {
    for (const a of actorsOf(e)) {
      const k = a.toLowerCase();
      if (!firstSeen.has(k)) firstSeen.set(k, e.time);
      (markets.get(k) ?? markets.set(k, new Set()).get(k)!).add(marketKey(e));
    }
  }
  const active = new Set(events.flatMap((e) => actorsOf(e).map((a) => a.toLowerCase())));
  const newcomers = [...active].filter((a) => (firstSeen.get(a) ?? 0) >= from);
  const returning = [...active].filter((a) => (firstSeen.get(a) ?? 0) < from || (markets.get(a)?.size ?? 0) >= 2);
  const roleCount = (names: string[], key: "buyer" | "bidder" | "seller") =>
    new Set(events.flatMap((e) => (names.includes(e.name) && key in e ? [(e as unknown as Record<string, Address>)[key].toLowerCase()] : []))).size;

  // ── tenders ──
  const sealedBids = tenders.reduce((n, t) => n + t.core.bidCount, 0);
  const revealedBids = tenders.reduce((n, t) => n + t.core.revealedCount, 0);
  const finishedTenders = tenders.filter((t) => t.state !== TenderState.Open && t.state !== TenderState.Reveal);
  const countState = (s: TenderState) => tenders.filter((t) => t.state === s).length;
  const tender = {
    total: tenders.length,
    withBids: tenders.filter((t) => t.core.bidCount > 0).length,
    sealedBids,
    revealedBids,
    finished: finishedTenders.length,
    awarded: countState(TenderState.Awarded),
    cancelled: countState(TenderState.Cancelled),
    failed: countState(TenderState.Failed),
    evaluating: countState(TenderState.Evaluation),
    open: countState(TenderState.Open),
    reveal: countState(TenderState.Reveal),
    receivedRate: ratio(tenders.filter((t) => t.core.bidCount > 0).length, tenders.length),
    revealRate: ratio(revealedBids, sealedBids),
    awardRate: ratio(countState(TenderState.Awarded), finishedTenders.filter((t) => t.state !== TenderState.Cancelled).length),
    cancelRate: ratio(countState(TenderState.Cancelled), tenders.length),
  };

  // ── NFT auctions ──
  const auctionIds = new Set(auctions.map((a) => a.id));
  const nftEvents = snap.events.filter((e) => e.source === "nft" && auctionIds.has(idOf(e)));
  const countA = (s: AuctionState) => auctions.filter((a) => a.state === s).length;
  const sold = auctions.filter((a) => a.state === AuctionState.Settled);
  const nftBids = nftEvents.filter((e) => e.name === "BidPlaced" && e.first).length;
  const nft = {
    total: auctions.length,
    bidders: new Set(nftEvents.flatMap((e) => (e.name === "BidPlaced" ? [e.bidder.toLowerCase()] : []))).size,
    bids: nftBids,
    revealed: auctions.reduce((n, a) => n + a.core.revealedCount, 0),
    live: countA(AuctionState.Open) + countA(AuctionState.Reveal),
    sold: sold.length,
    noSale: countA(AuctionState.NoSale),
    cancelled: countA(AuctionState.Cancelled),
    awaitingSettle: countA(AuctionState.Settlement),
    volume: sold.reduce((n, a) => n + a.core.highestBid, 0n),
    avgBids: ratio(nftBids, auctions.length),
  };

  // ── transactions (successful calls are visible through their events) ──
  const txs = new Map<Hash, ChainEvent>();
  for (const e of events) if (!txs.has(e.txHash)) txs.set(e.txHash, e);
  const byType = new Map<string, number>();
  for (const e of txs.values()) byType.set(txLabel(e), (byType.get(txLabel(e)) ?? 0) + 1);
  const known = [...txs.keys()].flatMap((h) => (snap.gas.has(h) ? [snap.gas.get(h)!] : []));
  const fees = known.reduce((n, g) => n + g.fee, 0n);
  const tx = {
    total: txs.size,
    byType: [...byType.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    gasKnown: known.length,
    fees,
    avgFee: known.length ? fees / BigInt(known.length) : undefined,
    avgGas: known.length ? known.reduce((n, g) => n + g.gasUsed, 0n) / BigInt(known.length) : undefined,
  };

  // ── settlement ──
  const sum = (names: string[], source: "tender" | "nft") =>
    events.filter((e) => e.source === source && names.includes(e.name)).reduce((n, e) => n + ("amount" in e ? e.amount : 0n), 0n);
  const countEv = (name: string, source: "tender" | "nft") => events.filter((e) => e.source === source && e.name === name).length;
  const doneMarkets = tender.awarded + tender.failed + nft.sold + auctions.filter((a) => a.state === AuctionState.NoSale && a.core.settled).length;
  const pendingMarkets = tender.evaluating + nft.awaitingSettle + auctions.filter((a) => a.state === AuctionState.NoSale && !a.core.settled).length;
  const settlement = {
    completed: doneMarkets,
    pending: pendingMarkets,
    completionRate: ratio(doneMarkets, doneMarkets + pendingMarkets),
    bondRefunds: countEv("BondWithdrawn", "tender"),
    bondRefunded: sum(["BondWithdrawn"], "tender"),
    forfeitSwept: sum(["ForfeitedBondsSwept"], "tender"),
    depositRefunds: countEv("Withdrawn", "nft"),
    depositRefunded: sum(["Withdrawn"], "nft"),
    awaitingAward: tender.evaluating,
    awaitingSettle: nft.awaitingSettle + auctions.filter((a) => a.state === AuctionState.NoSale && !a.core.settled).length,
  };

  // ── daily activity ──
  const lastDay = Math.floor(nowSec / DAY);
  const firstDay = range === 0 ? Math.floor((snap.events[0]?.time ?? nowSec) / DAY) : lastDay - range + 1;
  const start = Math.max(firstDay, lastDay - 89);
  const perDay = new Map<number, number>();
  for (const e of txs.values()) {
    const d = Math.floor(e.time / DAY);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const daily = Array.from({ length: lastDay - start + 1 }, (_, i) => ({ day: (start + i) * DAY, txs: perDay.get(start + i) ?? 0 }));

  return {
    overview: { tenders: tenders.length, auctions: auctions.length, wallets: active.size, transactions: txs.size },
    tender,
    tenderRows: tenders,
    nft,
    tx,
    participants: {
      unique: active.size,
      newcomers: newcomers.length,
      returning: returning.length,
      buyers: roleCount(["TenderCreated"], "buyer"),
      bidders: roleCount(["BidSubmitted", "BidPlaced"], "bidder"),
      sellers: roleCount(["AuctionCreated"], "seller"),
    },
    settlement,
    daily,
    events,
  };
}

/** English action names for the CSV export (a data file, not UI text). */
const TX_LABELS: Record<string, string> = {
  "tender:TenderCreated": "Create tender",
  "tender:BidSubmitted": "Seal tender bid",
  "tender:BidRevealed": "Reveal tender bid",
  "tender:TenderAwarded": "Award tender",
  "tender:TenderCancelled": "Cancel tender",
  "tender:BondWithdrawn": "Withdraw bond",
  "tender:ForfeitedBondsSwept": "Sweep forfeited bonds",
  "nft:AuctionCreated": "List NFT",
  "nft:BidPlaced": "Seal NFT bid",
  "nft:BidRevealed": "Reveal NFT bid",
  "nft:AuctionSettled": "Settle auction",
  "nft:AuctionCancelled": "Cancel auction",
  "nft:Withdrawn": "Withdraw deposit / proceeds",
};

export function txLabel(e: ChainEvent): string {
  return TX_LABELS[`${e.source}:${e.name}`] ?? e.name;
}

/** Vietnamese names for the same actions, keyed by the English label (the analytics page shows these). */
export const TX_LABEL_VI: Record<string, string> = {
  "Create tender": "Tạo gói thầu",
  "Seal tender bid": "Niêm phong hồ sơ thầu",
  "Reveal tender bid": "Công bố hồ sơ thầu",
  "Award tender": "Trao thầu",
  "Cancel tender": "Hủy gói thầu",
  "Withdraw bond": "Rút tiền bảo đảm",
  "Sweep forfeited bonds": "Chuyển tiền bảo đảm bị phạt",
  "List NFT": "Đăng bán NFT",
  "Seal NFT bid": "Niêm phong giá NFT",
  "Reveal NFT bid": "Công bố giá NFT",
  "Settle auction": "Kết thúc đấu giá",
  "Cancel auction": "Hủy đấu giá",
  "Withdraw deposit / proceeds": "Rút tiền cọc / tiền bán",
};

// ───────────────────────── export ─────────────────────────

const csvCell = (v: unknown) => {
  const s = typeof v === "bigint" ? v.toString() : v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per on-chain event in the range. Amounts are in wei-style base units (18 decimals). */
export function eventsCsv(events: ChainEvent[]): string {
  const head = ["block", "approx_time_utc", "tx_hash", "market", "id", "event", "action", "wallet", "amount_base_units"];
  const rows = events.map((e) => [
    e.blockNumber,
    new Date(e.time * 1000).toISOString(),
    e.txHash,
    e.source === "tender" ? "tender" : "nft_auction",
    idOf(e),
    e.name,
    txLabel(e),
    actorsOf(e)[0] ?? "",
    "amount" in e ? e.amount : "",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Full report as JSON (bigints as strings). */
export function analyticsJson(a: Analytics, meta: { range: Range; generatedAt: string; head: bigint; blockTime: number }): string {
  const { events, tenderRows, ...rest } = a;
  return JSON.stringify(
    {
      meta: { ...meta, head: meta.head.toString(), note: "Times are estimated from block numbers; amounts are base units (18 decimals)." },
      ...rest,
      tenders: tenderRows.map((t) => ({ id: t.id, state: TenderState[t.state], bids: t.core.bidCount, revealed: t.core.revealedCount, budgetMin: t.budgetMin, budgetMax: t.budgetMax })),
      events: events.map((e) => ({ ...e, wallet: actorsOf(e)[0] })),
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

