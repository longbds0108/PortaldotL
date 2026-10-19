import { describe, expect, it } from "vitest";
import type { Hash } from "viem";
import { DisputeStatus, TargetKind } from "./disputes";
import type { ChainEvent, MarketSnapshot } from "./market-data";
import type { TenderCore } from "./market-storage";
import { BASE_SCORE, RULES, computeReputation } from "./reputation";

const BUYER = "0x1111111111111111111111111111111111111111";
const ALICE = "0x2222222222222222222222222222222222222222";
const BOB = "0x3333333333333333333333333333333333333333" as const;
const NOW = 1_000_000;
let n = 0;
const ev = (e: Record<string, unknown>, time: number) =>
  ({ blockNumber: BigInt(time), txHash: `0x${(++n).toString(16).padStart(64, "0")}` as Hash, logIndex: 0, time, ...e }) as unknown as ChainEvent;
const core = (o: Partial<TenderCore>): TenderCore => ({
  buyer: BUYER, submissionDeadline: 100n, bidCount: 2, winner: ALICE, revealDeadline: 200n, revealedCount: 1,
  bidBond: 0n, createdBlock: 1n, cancelled: false, awarded: true, forfeitSwept: false, ...o,
});

const snap: MarketSnapshot = {
  tenders: [{ id: 0n, core: core({}), budgetMin: 0n, budgetMax: 0n }],
  auctions: [],
  events: [
    ev({ source: "tender", name: "TenderCreated", tenderId: 0n, buyer: BUYER }, 10),
    ev({ source: "tender", name: "BidSubmitted", tenderId: 0n, bidder: ALICE, first: true }, 20),
    ev({ source: "tender", name: "BidSubmitted", tenderId: 0n, bidder: BOB, first: true }, 30),
    ev({ source: "tender", name: "BidRevealed", tenderId: 0n, bidder: ALICE, amount: 1n }, 150),
    ev({ source: "tender", name: "TenderAwarded", tenderId: 0n, winner: ALICE, amount: 1n }, 300),
  ],
  head: { number: 1000n, timestamp: NOW },
  blockTime: 6,
  gas: new Map(),
};

describe("reputation", () => {
  it("scores completed and missed obligations with a reason for every change", () => {
    const r = computeReputation(snap, [], NOW);
    const alice = r.get(ALICE.toLowerCase())!;
    expect(alice.score).toBe(BASE_SCORE + RULES.revealed.points + RULES.wonTender.points);
    expect(alice.bidder).toMatchObject({ sealed: 1, revealed: 1, missed: 0, wins: 1 });
    expect(alice.ledger.map((l) => l.rule)).toEqual(["revealed", "wonTender"]);
    const bob = r.get(BOB.toLowerCase())!;
    expect(bob.bidder.missed).toBe(1);
    expect(bob.score).toBe(BASE_SCORE + RULES.missedReveal.points);
    expect(bob.ledger[0].txHash).toBeDefined(); // the sealed bid that was never opened
    const buyer = r.get(BUYER.toLowerCase())!;
    expect(buyer.creator).toMatchObject({ published: 1, awarded: 1, cancelled: 0 });
    expect(buyer.badges.map((b) => b.key)).toContain("finisher");
  });

  it("only upheld disputes on panel or engine grounds move scores", () => {
    const d = (id: bigint, status: DisputeStatus, reason: number) => ({ id, core: { opener: BOB, kind: TargetKind.Tender, status, reason, targetId: 0n }, openedAt: 400 });
    const r = computeReputation(snap, [d(0n, DisputeStatus.Resolved, 2), d(1n, DisputeStatus.Rejected, 2), d(2n, DisputeStatus.Resolved, 5)], NOW);
    const buyer = r.get(BUYER.toLowerCase())!;
    expect(buyer.disputes).toMatchObject({ aboutThem: 3, upheldAgainst: 1, rejectedAgainst: 1 });
    expect(buyer.ledger.filter((l) => l.rule === "disputeUpheldAgainst")).toHaveLength(1);
    expect(r.get(BOB.toLowerCase())!.ledger.some((l) => l.rule === "disputeUpheldOpened")).toBe(true);
  });
});
