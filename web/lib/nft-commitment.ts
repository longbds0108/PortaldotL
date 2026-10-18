import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * NFT auction commitment — MUST match contracts/src/NFTCommitmentLib.sol:
 *   keccak256(abi.encode(auctionId, bidder, amount18, salt))
 * Cross-checked against contracts/test/fixtures/nft-commitment-vectors.json in nft-commitment.test.ts.
 *
 * Runs purely client-side: amount and salt must never reach an RPC or server before reveal.
 */
export type NftCommitmentInput = {
  auctionId: bigint;
  bidder: Address;
  /** tPOTv3, 18 decimals */
  amount18: bigint;
  salt: Hex;
};

const PARAMS = [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }] as const;

export function computeNftCommitment({ auctionId, bidder, amount18, salt }: NftCommitmentInput): Hex {
  return keccak256(encodeAbiParameters(PARAMS, [auctionId, bidder, amount18, salt]));
}

export function verifyNftCommitment(input: NftCommitmentInput, commitment: Hex): boolean {
  return computeNftCommitment(input).toLowerCase() === commitment.toLowerCase();
}
