import { bytesToHex, encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";
import { BLINDBID_ADDRESS, BLINDBID_VERSION, PORTALDOT_CHAIN_ID } from "./env";

/**
 * Canonical commitment, in the format of the market the app is pointed at. MUST match the contracts byte-for-byte:
 *   V1 (contracts/src/CommitmentLib.sol):
 *     keccak256(abi.encode(tenderId, bidder, amount18, salt, keccak256(docKey)))
 *   V2 (contracts/src/v2/BlindBidMarketV2.sol, CommitReveal.sol):
 *     payload = keccak256(abi.encode(amount18, keccak256(docKey)))
 *     keccak256(abi.encode(TENDER_DOMAIN_TAG, chainId, contract, tenderId, bidder, payload, salt))
 * Cross-checked against contracts/test/fixtures/commitment-vectors.json and commitment-v2-vectors.json.
 *
 * Runs purely client-side: salt/docKey/amount must never be sent to an RPC or server before reveal.
 */
export const TENDER_DOMAIN_TAG = keccak256(stringToHex("plinths.tender.commit.v2"));

export type CommitmentDomain = { chainId: number | bigint; contract: Address };

/** Domain of the configured market; null on V1, whose commitments have none. */
export const marketCommitmentDomain: CommitmentDomain | null =
  BLINDBID_VERSION === 2 && BLINDBID_ADDRESS ? { chainId: PORTALDOT_CHAIN_ID, contract: BLINDBID_ADDRESS } : null;

export type CommitmentInput = {
  tenderId: bigint;
  bidder: Address;
  /** tPOTv3, 18 decimals */
  amount18: bigint;
  salt: Hex;
  /** raw 32-byte AES-256 key */
  docKey: Hex;
  /** Defaults to the configured market. null forces the V1 format. */
  domain?: CommitmentDomain | null;
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

const DOMAIN_PARAMS = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

export function computeCommitment({ tenderId, bidder, amount18, salt, docKey, domain = marketCommitmentDomain }: CommitmentInput): Hex {
  if (!domain) {
    return keccak256(encodeAbiParameters(COMMITMENT_PARAMS, [tenderId, bidder, amount18, salt, hashDocKey(docKey)]));
  }
  const payload = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [amount18, hashDocKey(docKey)]));
  return keccak256(
    encodeAbiParameters(DOMAIN_PARAMS, [TENDER_DOMAIN_TAG, BigInt(domain.chainId), domain.contract, tenderId, bidder, payload, salt]),
  );
}

export function verifyCommitment(input: CommitmentInput, commitment: Hex): boolean {
  return computeCommitment(input).toLowerCase() === commitment.toLowerCase();
}

export function randomBytes32(): Hex {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}
