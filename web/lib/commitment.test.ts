import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { computeCommitment, hashDocKey, randomBytes32, verifyCommitment } from "./commitment";

// Same fixture is asserted by contracts/test/BlindBidMarket.t.sol (test_commitmentMatchesSharedVectors).
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../contracts/test/fixtures/commitment-vectors.json"), "utf8"),
) as {
  vectors: {
    tenderId: string;
    bidder: Address;
    amount: string;
    salt: Hex;
    docKey: Hex;
    docKeyHash: Hex;
    commitment: Hex;
  }[];
};

describe("commitment (TS ↔ Solidity)", () => {
  it.each(fixture.vectors.map((v, i) => [i, v] as const))("matches shared vector #%i", (_, v) => {
    expect(hashDocKey(v.docKey)).toBe(v.docKeyHash);
    const input = { tenderId: BigInt(v.tenderId), bidder: v.bidder, amount14: BigInt(v.amount), salt: v.salt, docKey: v.docKey };
    expect(computeCommitment(input)).toBe(v.commitment);
    expect(verifyCommitment(input, v.commitment.toUpperCase().replace("0X", "0x") as Hex)).toBe(true);
  });

  it("binds every field", () => {
    const v = fixture.vectors[1];
    const input = { tenderId: BigInt(v.tenderId), bidder: v.bidder, amount14: BigInt(v.amount), salt: v.salt, docKey: v.docKey };
    expect(verifyCommitment({ ...input, amount14: input.amount14 + 1n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, tenderId: input.tenderId + 1n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, salt: randomBytes32() }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, docKey: randomBytes32() }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, bidder: "0x000000000000000000000000000000000000dEaD" }, v.commitment)).toBe(false);
  });

  it("randomBytes32 is 32 random bytes", () => {
    const a = randomBytes32();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(randomBytes32());
  });
});
