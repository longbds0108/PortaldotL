import { bytesToHex, encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";

/**
 * Same hashing as CommitReveal.sol, checked against test/vectors.json from both languages.
 *   commitment = keccak256(abi.encode(domainTag, chainId, verifyingContract, roundId, committer, payloadHash, salt))
 *
 * Run it on the committer's own device: nothing here may reach a server, RPC or log before the reveal.
 */
export type CommitInput = {
  /** From `domainTag("yourapp.thing.commit.v1")`. */
  domainTag: Hex;
  chainId: bigint | number;
  verifyingContract: Address;
  roundId: bigint;
  committer: Address;
  /** Hash of your sealed values, e.g. keccak256(encodeAbiParameters(...)). Encode with fixed-width types. */
  payloadHash: Hex;
  /** 32 bytes from `randomSalt()`. Never reuse one. */
  salt: Hex;
};

const COMMIT_PARAMS = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

export function domainTag(name: string): Hex {
  return keccak256(stringToHex(name));
}

export function computeCommitment(i: CommitInput): Hex {
  return keccak256(encodeAbiParameters(COMMIT_PARAMS, [i.domainTag, BigInt(i.chainId), i.verifyingContract, i.roundId, i.committer, i.payloadHash, i.salt]));
}

export function verifyCommitment(i: CommitInput, commitment: Hex): boolean {
  return computeCommitment(i).toLowerCase() === commitment.toLowerCase();
}

export function randomSalt(): Hex {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

export const EMPTY_DIGEST: Hex = `0x${"0".repeat(64)}`;

/** One step of the reveal-set digest. Start from EMPTY_DIGEST and go through reveals in the order they happened. */
export function foldReveal(previous: Hex, committer: Address, value: bigint, commitment: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }], [previous, committer, value, commitment]),
  );
}
