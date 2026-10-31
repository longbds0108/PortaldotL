import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import { TenderState } from "./contracts";
import { BLINDBID_VERSION } from "./env";

/*
 * BlindBidMarket has no view functions (PortaldotV3 charges a deposit per byte of code), so the app reads its
 * storage directly. This layout is pinned by contracts/test/BlindBidMarket.t.sol (test_storageLayoutMatchesApp):
 *   slot 0  ReentrancyGuard._status
 *   slot 1  Tender[] _tenders          (length; element i at keccak(1) + 3·i, or + 5·i on BlindBidMarketV2)
 *   slot 2  mapping(id => mapping(bidder => Bid)) _bids   (Bid at keccak(bidder . keccak(id . 2)))
 *   Tender w0 = buyer(160) | submissionDeadline(64) | bidCount(32)
 *          w1 = winner(160) | revealDeadline(64) | revealedCount(32)
 *          w2 = bidBond(96) | createdBlock(64) | cancelled(8) | awarded(8) | forfeitSwept(8)
 *          V2 adds w3 = budgetMin(128) | budgetMax(128), w4 = revealSetDigest; the app reads neither (budgets come
 *          from TenderCreated, the digest from SelectionRecorded).
 *   Bid    w0 = commitment
 *          w1 = bond(96) | amount(128) | revealed(8) | bondWithdrawn(8)
 */
export const TENDERS_SLOT = 1n;
export const BIDS_SLOT = 2n;
export const TENDER_WORDS = BLINDBID_VERSION === 2 ? 5n : 3n;

export type TenderCore = {
  buyer: Address;
  submissionDeadline: bigint;
  bidCount: number;
  winner: Address;
  revealDeadline: bigint;
  revealedCount: number;
  bidBond: bigint;
  createdBlock: bigint;
  cancelled: boolean;
  awarded: boolean;
  forfeitSwept: boolean;
};

export type BidCore = { commitment: Hex; bond: bigint; amount: bigint; revealed: boolean; bondWithdrawn: boolean };

const word = (n: bigint) => toHex(n, { size: 32 });
const bits = (w: bigint, offset: number, size: number) => (w >> BigInt(offset)) & ((1n << BigInt(size)) - 1n);
const addr = (w: bigint) => toHex(bits(w, 0, 160), { size: 20 }) as Address;

export function tenderSlot(id: bigint, words = TENDER_WORDS): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [TENDERS_SLOT]))) + id * words;
}

export function bidSlot(id: bigint, bidder: Address): bigint {
  const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [id, BIDS_SLOT]));
  return BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [bidder, inner])));
}

export function decodeTender([w0, w1, w2]: [bigint, bigint, bigint]): TenderCore {
  return {
    buyer: addr(w0),
    submissionDeadline: bits(w0, 160, 64),
    bidCount: Number(bits(w0, 224, 32)),
    winner: addr(w1),
    revealDeadline: bits(w1, 160, 64),
    revealedCount: Number(bits(w1, 224, 32)),
    bidBond: bits(w2, 0, 96),
    createdBlock: bits(w2, 96, 64),
    cancelled: bits(w2, 160, 8) === 1n,
    awarded: bits(w2, 168, 8) === 1n,
    forfeitSwept: bits(w2, 176, 8) === 1n,
  };
}

export function decodeBid([w0, w1]: [bigint, bigint]): BidCore {
  return {
    commitment: toHex(w0, { size: 32 }),
    bond: bits(w1, 0, 96),
    amount: bits(w1, 96, 128),
    revealed: bits(w1, 224, 8) === 1n,
    bondWithdrawn: bits(w1, 232, 8) === 1n,
  };
}

/** Mirror of BlindBidMarket._state — the contract decides with block.timestamp; `nowSec` is chain time. */
export function tenderState(t: TenderCore, nowSec: number): TenderState {
  if (t.cancelled) return TenderState.Cancelled;
  if (t.awarded) return TenderState.Awarded;
  if (nowSec < Number(t.submissionDeadline)) return TenderState.Open;
  if (nowSec < Number(t.revealDeadline)) return TenderState.Reveal;
  return t.revealedCount === 0 ? TenderState.Failed : TenderState.Evaluation;
}

async function load(client: PublicClient, address: Address, slot: bigint): Promise<bigint> {
  return BigInt((await client.getStorageAt({ address, slot: word(slot) })) ?? "0x0");
}

export async function readTenderCount(client: PublicClient, address: Address): Promise<bigint> {
  return load(client, address, TENDERS_SLOT);
}

export async function readTender(client: PublicClient, address: Address, id: bigint): Promise<TenderCore> {
  const base = tenderSlot(id);
  const [w0, w1, w2] = await Promise.all([0n, 1n, 2n].map((i) => load(client, address, base + i)));
  return decodeTender([w0, w1, w2]);
}

export async function readBid(client: PublicClient, address: Address, id: bigint, bidder: Address): Promise<BidCore> {
  const base = bidSlot(id, bidder);
  const [w0, w1] = await Promise.all([load(client, address, base), load(client, address, base + 1n)]);
  return decodeBid([w0, w1]);
}
