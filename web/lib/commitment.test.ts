import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { TENDER_DOMAIN_TAG, computeCommitment, hashDocKey, randomBytes32, verifyCommitment } from "./commitment";

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
    const input = { tenderId: BigInt(v.tenderId), bidder: v.bidder, amount18: BigInt(v.amount), salt: v.salt, docKey: v.docKey };
    expect(computeCommitment(input)).toBe(v.commitment);
    expect(verifyCommitment(input, v.commitment.toUpperCase().replace("0X", "0x") as Hex)).toBe(true);
  });

  it("binds every field", () => {
    const v = fixture.vectors[1];
    const input = { tenderId: BigInt(v.tenderId), bidder: v.bidder, amount18: BigInt(v.amount), salt: v.salt, docKey: v.docKey };
    expect(verifyCommitment({ ...input, amount18: input.amount18 + 1n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, tenderId: input.tenderId + 1n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, salt: randomBytes32() }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, docKey: randomBytes32() }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, bidder: "0x000000000000000000000000000000000000dEaD" }, v.commitment)).toBe(false);
  });

  it("defaults to the V1 format while the app points at a V1 market", () => {
    const v = fixture.vectors[0];
    const input = { tenderId: BigInt(v.tenderId), bidder: v.bidder, amount18: BigInt(v.amount), salt: v.salt, docKey: v.docKey };
    expect(computeCommitment({ ...input, domain: null })).toBe(computeCommitment(input));
  });

  it("randomBytes32 is 32 random bytes", () => {
    const a = randomBytes32();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(randomBytes32());
  });
});

// Same fixture is asserted by contracts/test/v2/BlindBidMarketV2.t.sol, generated independently with cast.
const v2 = JSON.parse(
  readFileSync(resolve(__dirname, "../../contracts/test/fixtures/commitment-v2-vectors.json"), "utf8"),
) as {
  tenderDomainTag: Hex;
  tender: { chainId: string; contract: Address; tenderId: string; bidder: Address; amount: string; salt: Hex; docKey: Hex; commitment: Hex }[];
};

describe("V2 commitment (TS ↔ Solidity)", () => {
  const inputOf = (v: (typeof v2.tender)[number]) => ({
    tenderId: BigInt(v.tenderId),
    bidder: v.bidder,
    amount18: BigInt(v.amount),
    salt: v.salt,
    docKey: v.docKey,
    domain: { chainId: BigInt(v.chainId), contract: v.contract },
  });

  it("uses the shared domain tag", () => {
    expect(TENDER_DOMAIN_TAG).toBe(v2.tenderDomainTag);
  });

  it.each(v2.tender.map((v, i) => [i, v] as const))("matches shared vector #%i", (_, v) => {
    expect(computeCommitment(inputOf(v))).toBe(v.commitment);
  });

  it("binds chain and contract: the same opening gives a different commitment", () => {
    const [here, otherChain, otherContract] = v2.tender;
    expect(new Set([here.commitment, otherChain.commitment, otherContract.commitment]).size).toBe(3);
    const input = inputOf(here);
    expect(verifyCommitment({ ...input, domain: { ...input.domain, chainId: 1n } }, here.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, domain: { ...input.domain, contract: otherContract.contract } }, here.commitment)).toBe(false);
    expect(verifyCommitment({ ...input, domain: null }, here.commitment)).toBe(false);
  });
});
