import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { EMPTY_DIGEST, computeCommitment, domainTag, foldReveal, randomSalt, verifyCommitment, type CommitInput } from "../src/commitReveal";

// test/CommitReveal.t.sol asserts the same file.
const vectors = JSON.parse(readFileSync(resolve(__dirname, "vectors.json"), "utf8")) as {
  domainName: string;
  domainTag: Hex;
  commitments: { chainId: string; contract: Address; roundId: string; committer: Address; value: string; salt: Hex; payloadHash: Hex; commitment: Hex }[];
  foldReveal: { after1: Hex; after2: Hex };
};

const inputOf = (v: (typeof vectors.commitments)[number]): CommitInput => ({
  domainTag: vectors.domainTag,
  chainId: BigInt(v.chainId),
  verifyingContract: v.contract,
  roundId: BigInt(v.roundId),
  committer: v.committer,
  payloadHash: keccak256(encodeAbiParameters([{ type: "uint256" }], [BigInt(v.value)])),
  salt: v.salt,
});

describe("commit-reveal hashing", () => {
  it("derives the shared domain tag", () => {
    expect(domainTag(vectors.domainName)).toBe(vectors.domainTag);
  });

  it.each(vectors.commitments.map((v, i) => [i, v] as const))("matches vector #%i", (_, v) => {
    const input = inputOf(v);
    expect(input.payloadHash).toBe(v.payloadHash);
    expect(computeCommitment(input)).toBe(v.commitment);
    expect(verifyCommitment(input, v.commitment)).toBe(true);
  });

  it("gives a different commitment on another chain, contract or round", () => {
    const set = new Set([0, 2, 3, 4].map((i) => vectors.commitments[i].commitment));
    expect(set.size).toBe(4);
  });

  it("rejects any changed field", () => {
    const v = vectors.commitments[0];
    const i = inputOf(v);
    expect(verifyCommitment({ ...i, salt: randomSalt() }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...i, chainId: 2n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...i, roundId: 9n }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...i, committer: vectors.commitments[1].committer }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...i, payloadHash: keccak256("0x01") }, v.commitment)).toBe(false);
    expect(verifyCommitment({ ...i, domainTag: domainTag("another.app.v1") }, v.commitment)).toBe(false);
  });

  it("folds reveals in order, matching the vectors", () => {
    const [a, b] = vectors.commitments;
    const after1 = foldReveal(EMPTY_DIGEST, a.committer, BigInt(a.value), a.commitment);
    expect(after1).toBe(vectors.foldReveal.after1);
    expect(foldReveal(after1, b.committer, BigInt(b.value), b.commitment)).toBe(vectors.foldReveal.after2);
  });

  it("makes 32 random bytes", () => {
    expect(randomSalt()).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomSalt()).not.toBe(randomSalt());
  });
});
