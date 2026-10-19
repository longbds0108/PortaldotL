import { describe, expect, it } from "vitest";
import type { Hash } from "viem";
import { computeAnalytics, eventsCsv } from "./analytics";
import type { ChainEvent, MarketSnapshot } from "./market-data";
import type { TenderCore } from "./market-storage";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const NOW = 100 * 86_400;
const E = 10n ** 18n;
let n = 0;
const tx = () => `0x${(++n).toString(16).padStart(64, "0")}` as Hash;
const ev = (e: Record<string, unknown>, daysAgo: number) =>
  ({ blockNumber: BigInt(1000 - daysAgo), txHash: tx(), logIndex: 0, time: NOW - daysAgo * 86_400, ...e }) as unknown as ChainEvent;

const tender = (o: Partial<TenderCore>): TenderCore => ({
  buyer: A,
  submissionDeadline: BigInt(NOW + 1000),
  bidCount: 0,
  winner: "0x0000000000000000000000000000000000000000",
  revealDeadline: BigInt(NOW + 2000),
  revealedCount: 0,
  bidBond: 0n,
  createdBlock: 1n,
  cancelled: false,
  awarded: false,
  forfeitSwept: false,
  ...o,
});

const snap: MarketSnapshot = {
  tenders: [
    // old (40 days ago), awarded, 2 bids / 2 revealed
    { id: 0n, core: tender({ submissionDeadline: 1n, revealDeadline: 2n, bidCount: 2, revealedCount: 2, awarded: true }), budgetMin: E, budgetMax: 2n * E },
    // recent (3 days ago), open, 1 bid
    { id: 1n, core: tender({ bidCount: 1 }), budgetMin: E, budgetMax: 2n * E },
    // recent, cancelled, no bids
    { id: 2n, core: tender({ cancelled: true }), budgetMin: E, budgetMax: 2n * E },
  ],
  auctions: [],
  events: [
    ev({ source: "tender", name: "TenderCreated", tenderId: 0n, buyer: A }, 40),
    ev({ source: "tender", name: "BidSubmitted", tenderId: 0n, bidder: B, first: true }, 39),
    ev({ source: "tender", name: "BidSubmitted", tenderId: 0n, bidder: C, first: true }, 39),
    ev({ source: "tender", name: "BondWithdrawn", tenderId: 0n, bidder: B, amount: E }, 30),
    ev({ source: "tender", name: "TenderCreated", tenderId: 1n, buyer: A }, 3),
    ev({ source: "tender", name: "BidSubmitted", tenderId: 1n, bidder: B, first: true }, 2),
    ev({ source: "tender", name: "TenderCreated", tenderId: 2n, buyer: C }, 1),
  ],
  head: { number: 1000n, timestamp: NOW },
  blockTime: 6,
  gas: new Map(),
};

describe("analytics", () => {
  it("counts everything for all time", () => {
    const a = computeAnalytics(snap, 0, NOW);
    expect(a.overview).toEqual({ tenders: 3, auctions: 0, wallets: 3, transactions: 7 });
    expect(a.tender).toMatchObject({ total: 3, withBids: 2, sealedBids: 3, revealedBids: 2, awarded: 1, cancelled: 1, open: 1 });
    expect(a.tender.revealRate).toBeCloseTo(2 / 3);
    expect(a.tender.awardRate).toBe(1); // 1 awarded of 1 finished non-cancelled
    expect(a.settlement).toMatchObject({ bondRefunds: 1, bondRefunded: E });
    expect(a.participants).toMatchObject({ unique: 3, newcomers: 3, buyers: 2, bidders: 2 });
  });

  it("filters by time and tells newcomers from returning wallets", () => {
    const a = computeAnalytics(snap, 7, NOW);
    expect(a.overview).toEqual({ tenders: 2, auctions: 0, wallets: 3, transactions: 3 });
    // A and B were seen before the window; C was too (as a bidder 39 days ago)
    expect(a.participants).toMatchObject({ unique: 3, newcomers: 0, returning: 3 });
    expect(a.daily).toHaveLength(7);
    expect(a.daily.reduce((s, d) => s + d.txs, 0)).toBe(3);
  });

  it("exports events as CSV", () => {
    const csv = eventsCsv(computeAnalytics(snap, 7, NOW).events);
    expect(csv.split("\n")[0]).toBe("block,approx_time_utc,tx_hash,market,id,event,action,wallet,amount_base_units");
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).toContain("Create tender");
  });
});
