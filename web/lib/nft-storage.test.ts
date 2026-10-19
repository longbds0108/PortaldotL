import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { AuctionState } from "./nft-auction";
import { auctionBidSlot, auctionSlot, auctionState, decodeAuction, decodeAuctionBid, withdrawableAmount } from "./nft-storage";

// The Solidity side of this layout is asserted by contracts/test/SealedNFTAuction.t.sol (test_storageLayoutMatchesApp).

const SELLER = "0x1111111111111111111111111111111111111111";
const COLLECTION = "0x3333333333333333333333333333333333333333";
const WINNER = "0x2222222222222222222222222222222222222222";
const OTHER = "0x4444444444444444444444444444444444444444";
const ZERO = "0x0000000000000000000000000000000000000000";
const E = 10n ** 18n;

const pack = (...parts: [bigint, number][]) => parts.reduce((w, [v, off]) => w | (v << BigInt(off)), 0n);

const auction = (o: { winner?: string; settled?: boolean; cancelled?: boolean; paid?: boolean; highest?: bigint } = {}) =>
  decodeAuction([
    pack([BigInt(SELLER), 0], [1_000n, 160], [3n, 224]),
    pack([BigInt(COLLECTION), 0], [2_000n, 160], [2n, 224]),
    42n,
    pack([BigInt(o.winner ?? ZERO), 0], [777n, 160], [o.settled ? 1n : 0n, 224], [o.cancelled ? 1n : 0n, 232], [o.paid ? 1n : 0n, 240]),
    pack([5n * E, 0], [o.highest ?? 0n, 128]),
  ]);

describe("NFT auction storage layout", () => {
  it("locates Auction[i] after keccak256(slot 0), 5 words each", () => {
    const base = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [0n])));
    expect(base).toBe(0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563n);
    expect(auctionSlot(0n)).toBe(base);
    expect(auctionSlot(3n)).toBe(base + 15n);
  });

  it("locates a Bid at keccak(bidder . keccak(id . 1))", () => {
    const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [7n, 1n]));
    const expected = BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [SELLER, inner])));
    expect(auctionBidSlot(7n, SELLER)).toBe(expected);
  });

  it("decodes packed Auction words", () => {
    expect(auction({ winner: WINNER, settled: true, paid: true, highest: 9n * E })).toEqual({
      seller: SELLER,
      bidDeadline: 1_000n,
      bidCount: 3,
      collection: COLLECTION,
      revealDeadline: 2_000n,
      revealedCount: 2,
      tokenId: 42n,
      highestBidder: WINNER,
      createdBlock: 777n,
      settled: true,
      cancelled: false,
      proceedsPaid: true,
      reservePrice: 5n * E,
      highestBid: 9n * E,
    });
  });

  it("decodes packed Bid words", () => {
    const b = decodeAuctionBid([0xabcdefn, pack([12n * E, 0], [9n * E, 112], [1n, 224], [0n, 232])]);
    expect(b).toEqual({ commitment: `0x${"abcdef".padStart(64, "0")}`, deposit: 12n * E, amount: 9n * E, revealed: true, withdrawn: false });
  });

  it("derives the phase exactly like the contract", () => {
    expect(auctionState(auction(), 999)).toBe(AuctionState.Open);
    expect(auctionState(auction(), 1_000)).toBe(AuctionState.Reveal);
    expect(auctionState(auction(), 2_000)).toBe(AuctionState.NoSale);
    expect(auctionState(auction({ winner: WINNER }), 2_000)).toBe(AuctionState.Settlement);
    expect(auctionState(auction({ winner: WINNER, settled: true }), 2_000)).toBe(AuctionState.Settled);
    expect(auctionState(auction({ cancelled: true }), 10)).toBe(AuctionState.Cancelled);
  });

  it("mirrors withdraw() payouts", () => {
    const sold = auction({ winner: WINNER, settled: true, highest: 9n * E });
    const bid = (deposit: bigint, revealed: boolean, withdrawn = false) => ({ commitment: "0x01" as const, deposit, amount: 0n, revealed, withdrawn });
    expect(withdrawableAmount(sold, undefined, SELLER, 2_000)).toBe(9n * E);
    expect(withdrawableAmount(auction({ winner: WINNER, highest: 9n * E }), undefined, SELLER, 2_000)).toBe(0n); // not settled
    expect(withdrawableAmount(auction({ winner: WINNER, settled: true, paid: true, highest: 9n * E }), undefined, SELLER, 2_000)).toBe(0n);
    expect(withdrawableAmount(sold, bid(12n * E, true), WINNER, 1_500)).toBe(0n); // leader waits
    expect(withdrawableAmount(sold, bid(12n * E, true), WINNER, 2_000)).toBe(3n * E);
    expect(withdrawableAmount(sold, bid(10n * E, true), OTHER, 1_500)).toBe(10n * E); // outbid: free at once
    expect(withdrawableAmount(sold, bid(10n * E, false), OTHER, 1_500)).toBe(0n);
    expect(withdrawableAmount(sold, bid(10n * E, false), OTHER, 2_000)).toBe(9n * E); // 10% penalty
    expect(withdrawableAmount(sold, bid(10n * E, true, true), OTHER, 2_000)).toBe(0n);
  });
});
