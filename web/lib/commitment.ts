import { bytesToHex, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * Canonical commitment — MUST match contracts/src/CommitmentLib.sol:
 *   keccak256(abi.encode(tenderId, bidder, amount14, salt, keccak256(docKey)))
 * Cross-checked against contracts/test/fixtures/commitment-vectors.json in commitment.test.ts.
 *
 * Runs purely client-side: salt/docKey/amount must never be sent to an RPC or server before reveal.
 */
export type CommitmentInput = {
  tenderId: bigint;
  bidder: Address;
  /** tPOTv3, 14 decimals */
  amount14: bigint;
  salt: Hex;
  /** raw 32-byte AES-256 key */
  docKey: Hex;
};

const COMMITMENT_PARAMS = [
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

export function hashDocKey(docKey: Hex): Hex {
  return keccak256(docKey);
}

export function computeCommitment({ tenderId, bidder, amount14, salt, docKey }: CommitmentInput): Hex {
  return keccak256(
    encodeAbiParameters(COMMITMENT_PARAMS, [tenderId, bidder, amount14, salt, hashDocKey(docKey)]),
  );
}

export function verifyCommitment(input: CommitmentInput, commitment: Hex): boolean {
  return computeCommitment(input).toLowerCase() === commitment.toLowerCase();
}

export function randomBytes32(): Hex {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}
