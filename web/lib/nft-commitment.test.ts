import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { randomBytes32 } from "./commitment";
import { encodeListingData } from "./nft-auction";
import { computeNftCommitment, verifyNftCommitment } from "./nft-commitment";

// Same fixture is asserted by contracts/test/NFTCommitmentLib.t.sol (test_matchesSharedVectors).
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../contracts/test/fixtures/nft-commitment-vectors.json"), "utf8"),
) as { vectors: { auctionId: string; bidder: Address; amount: string; salt: Hex; commitment: Hex }[] };

const input = (v: (typeof fixture.vectors)[number]) => ({
  auctionId: BigInt(v.auctionId),
  bidder: v.bidder,
  amount18: BigInt(v.amount),
  salt: v.salt,
});

describe("NFT auction commitment (TS ↔ Solidity)", () => {
  it.each(fixture.vectors.map((v, i) => [i, v] as const))("matches shared vector #%i", (_, v) => {
    expect(computeNftCommitment(input(v))).toBe(v.commitment);
    expect(verifyNftCommitment(input(v), v.commitment)).toBe(true);
  });

  it("binds every field", () => {
    const v = fixture.vectors[1];
    const i = input(v);
    expect(verifyNftCommitment({ ...i, amount18: i.amount18 + 1n }, v.commitment)).toBe(false);
    expect(verifyNftCommitment({ ...i, auctionId: i.auctionId + 1n }, v.commitment)).toBe(false);
    expect(verifyNftCommitment({ ...i, salt: randomBytes32() }, v.commitment)).toBe(false);
    expect(verifyNftCommitment({ ...i, bidder: "0x000000000000000000000000000000000000dEaD" }, v.commitment)).toBe(false);
  });
});

describe("listing data", () => {
  it("is abi.encode(uint256 reserve, uint64 bidDeadline, uint64 revealDeadline)", () => {
    const data = encodeListingData({ reserve18: 5n * 10n ** 18n, bidDeadline: 1_800_000_000n, revealDeadline: 1_800_086_400n });
    expect(data).toBe(
      "0x" +
        (5n * 10n ** 18n).toString(16).padStart(64, "0") +
        (1_800_000_000n).toString(16).padStart(64, "0") +
        (1_800_086_400n).toString(16).padStart(64, "0"),
    );
  });
});
