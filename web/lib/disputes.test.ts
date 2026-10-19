import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { DisputeStatus, TargetKind, decodeDispute, disputeSlot, parseTxHashes, partiesOf, targetKey, verifyTxHashes } from "./disputes";

// The Solidity side of this layout is asserted by contracts/test/DisputeRegistry.t.sol (test_storageLayoutMatchesApp).

const OPENER = "0x1111111111111111111111111111111111111111";
const H1 = `0x${"a".repeat(64)}` as const;
const H2 = `0x${"b".repeat(64)}` as const;

const pack = (...parts: [bigint, number][]) => parts.reduce((w, [v, off]) => w | (v << BigInt(off)), 0n);

describe("dispute storage layout", () => {
  it("locates Dispute[i] after keccak256(slot 0), one word each", () => {
    const base = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [0n])));
    expect(disputeSlot(0n)).toBe(base);
    expect(disputeSlot(4n)).toBe(base + 4n);
  });

  it("decodes the packed word", () => {
    expect(decodeDispute(pack([BigInt(OPENER), 0], [1n, 160], [2n, 168], [4n, 176], [9n, 184]))).toEqual({
      opener: OPENER,
      kind: TargetKind.NftAuction,
      status: DisputeStatus.Resolved,
      reason: 4,
      targetId: 9n,
    });
  });

  it("builds the indexed target topic like the contract", () => {
    expect(targetKey(TargetKind.Tender, 3n)).toBe(3n);
    expect(targetKey(TargetKind.NftAuction, 3n)).toBe((1n << 64n) | 3n);
  });
});

describe("evidence helpers", () => {
  it("parses transaction hashes from free text", () => {
    expect(parseTxHashes(`${H1}, ${H1.toUpperCase().replace("0X", "0x")}\n${H2} nope`)).toEqual({ hashes: [H1, H2], invalid: ["nope"] });
  });

  it("verifies cited transactions against the target's events", () => {
    const checks = verifyTxHashes([H1, H2], [{ name: "BidSubmitted", txHash: H1, blockNumber: 7n }]);
    expect(checks[0]).toMatchObject({ ok: true, events: [{ name: "BidSubmitted" }] });
    expect(checks[1]).toEqual({ hash: H2, ok: false });
  });

  it("labels parties", () => {
    const ctx = { opener: OPENER, arbiter: OPENER, organizer: "0x2222222222222222222222222222222222222222", bidders: [OPENER], kind: TargetKind.Tender } as const;
    expect(partiesOf(OPENER, { ...ctx, bidders: [...ctx.bidders] })).toEqual(["arbiter", "opener", "bidder"]);
    expect(partiesOf("0x2222222222222222222222222222222222222222", { ...ctx, bidders: [] })).toEqual(["buyer"]);
  });
});
