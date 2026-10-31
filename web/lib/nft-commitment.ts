import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";
import type { CommitmentDomain } from "./commitment";
import { NFT_AUCTION_ADDRESS, NFT_AUCTION_VERSION, PORTALDOT_CHAIN_ID } from "./env";

/**
 * NFT auction commitment, in the format of the auction the app is pointed at. MUST match the contracts byte-for-byte:
 *   V1 (contracts/src/NFTCommitmentLib.sol): keccak256(abi.encode(auctionId, bidder, amount18, salt))
 *   V2 (contracts/src/v2/SealedNFTAuctionV2.sol, CommitReveal.sol):
 *     keccak256(abi.encode(AUCTION_DOMAIN_TAG, chainId, contract, auctionId, bidder, keccak256(abi.encode(amount18)), salt))
 * Cross-checked against contracts/test/fixtures/nft-commitment-vectors.json and commitment-v2-vectors.json.
 *
 * Runs purely client-side: amount and salt must never reach an RPC or server before reveal.
 */
export const AUCTION_DOMAIN_TAG = keccak256(stringToHex("plinths.nft-auction.commit.v2"));

/** Domain of the configured auction; null on V1, whose commitments have none. */
export const auctionCommitmentDomain: CommitmentDomain | null =
  NFT_AUCTION_VERSION === 2 && NFT_AUCTION_ADDRESS ? { chainId: PORTALDOT_CHAIN_ID, contract: NFT_AUCTION_ADDRESS } : null;

export type NftCommitmentInput = {
  auctionId: bigint;
  bidder: Address;
  /** tPOTv3, 18 decimals */
  amount18: bigint;
  salt: Hex;
  /** Defaults to the configured auction. null forces the V1 format. */
  domain?: CommitmentDomain | null;
};

const PARAMS = [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }] as const;

const DOMAIN_PARAMS = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

export function computeNftCommitment({ auctionId, bidder, amount18, salt, domain = auctionCommitmentDomain }: NftCommitmentInput): Hex {
  if (!domain) return keccak256(encodeAbiParameters(PARAMS, [auctionId, bidder, amount18, salt]));
  const payload = keccak256(encodeAbiParameters([{ type: "uint256" }], [amount18]));
  return keccak256(
    encodeAbiParameters(DOMAIN_PARAMS, [AUCTION_DOMAIN_TAG, BigInt(domain.chainId), domain.contract, auctionId, bidder, payload, salt]),
  );
}

export function verifyNftCommitment(input: NftCommitmentInput, commitment: Hex): boolean {
  return computeNftCommitment(input).toLowerCase() === commitment.toLowerCase();
}
