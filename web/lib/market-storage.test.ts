import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { TenderState } from "./contracts";
import { bidSlot, decodeBid, decodeTender, tenderSlot, tenderState } from "./market-storage";

// The Solidity side of this layout is asserted by contracts/test/BlindBidMarket.t.sol (test_storageLayoutMatchesApp).

const BUYER = "0x1111111111111111111111111111111111111111";
const WINNER = "0x2222222222222222222222222222222222222222";

const pack = (...parts: [bigint, number][]) => parts.reduce((w, [v, off]) => w | (v << BigInt(off)), 0n);

describe("market storage layout", () => {
  it("locates Tender[i] after keccak256(slot 1), 3 words each", () => {
    const base = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [1n])));
    expect(base).toBe(0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6n);
    expect(tenderSlot(0n)).toBe(base);
    expect(tenderSlot(5n)).toBe(base + 15n);
  });

  it("locates a Bid at keccak(bidder . keccak(id . 2))", () => {
    const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [7n, 2n]));
    const expected = BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [BUYER, inner])));
    expect(bidSlot(7n, BUYER)).toBe(expected);
  });

  it("decodes packed Tender words", () => {
    const t = decodeTender([
      pack([BigInt(BUYER), 0], [1_800_000_000n, 160], [3n, 224]),
      pack([BigInt(WINNER), 0], [1_800_086_400n, 160], [2n, 224]),
      pack([10n ** 19n, 0], [12_345n, 96], [0n, 160], [1n, 168], [1n, 176]),
    ]);
    expect(t).toEqual({
      buyer: BUYER,
      submissionDeadline: 1_800_000_000n,
      bidCount: 3,
      winner: WINNER,
      revealDeadline: 1_800_086_400n,
      revealedCount: 2,
      bidBond: 10n ** 19n,
      createdBlock: 12_345n,
      cancelled: false,
      awarded: true,
      forfeitSwept: true,
    });
  });

  it("decodes packed Bid words", () => {
    const b = decodeBid([0xabcdefn, pack([5n * 10n ** 18n, 0], [7_500n * 10n ** 18n, 96], [1n, 224], [0n, 232])]);
    expect(b.commitment).toBe(`0x${"abcdef".padStart(64, "0")}`);
    expect(b.bond).toBe(5n * 10n ** 18n);
    expect(b.amount).toBe(7_500n * 10n ** 18n);
    expect(b.revealed).toBe(true);
    expect(b.bondWithdrawn).toBe(false);
  });

  it("derives the phase exactly like the contract", () => {
    const t = decodeTender([pack([1_000n, 160]), pack([2_000n, 160]), 0n]);
    expect(tenderState(t, 999)).toBe(TenderState.Open);
    expect(tenderState(t, 1_000)).toBe(TenderState.Reveal);
    expect(tenderState(t, 2_000)).toBe(TenderState.Failed);
    expect(tenderState({ ...t, revealedCount: 1 }, 2_000)).toBe(TenderState.Evaluation);
    expect(tenderState({ ...t, awarded: true }, 0)).toBe(TenderState.Awarded);
    expect(tenderState({ ...t, cancelled: true, awarded: true }, 0)).toBe(TenderState.Cancelled);
  });
});
