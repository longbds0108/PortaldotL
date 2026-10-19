import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import { AuctionState } from "./nft-auction";

/*
 * SealedNFTAuction has no view functions (PortaldotV3 charges a deposit per byte of code), so the app reads its
 * storage directly. This layout is pinned by contracts/test/SealedNFTAuction.t.sol (test_storageLayoutMatchesApp):
 *   slot 0  Auction[] _auctions        (length; element i at keccak(0) + 5·i)
 *   slot 1  mapping(id => mapping(bidder => Bid)) _bids   (Bid at keccak(bidder . keccak(id . 1)))
 *   Auction w0 = seller(160) | bidDeadline(64) | bidCount(32)
 *           w1 = collection(160) | revealDeadline(64) | revealedCount(32)
 *           w2 = tokenId
 *           w3 = highestBidder(160) | createdBlock(64) | settled(8) | cancelled(8) | proceedsPaid(8)
 *           w4 = reservePrice(128) | highestBid(128)
 *   Bid     w0 = commitment
 *           w1 = deposit(112) | amount(112) | revealed(8) | withdrawn(8)
 */
export const AUCTIONS_SLOT = 0n;
export const NFT_BIDS_SLOT = 1n;
const AUCTION_WORDS = 5n;

export type AuctionCore = {
  seller: Address;
  bidDeadline: bigint;
  bidCount: number;
  collection: Address;
  revealDeadline: bigint;
  revealedCount: number;
  tokenId: bigint;
  highestBidder: Address;
  createdBlock: bigint;
  settled: boolean;
  cancelled: boolean;
  proceedsPaid: boolean;
  reservePrice: bigint;
  highestBid: bigint;
};

export type AuctionBidCore = { commitment: Hex; deposit: bigint; amount: bigint; revealed: boolean; withdrawn: boolean };

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const word = (n: bigint) => toHex(n, { size: 32 });
const bits = (w: bigint, offset: number, size: number) => (w >> BigInt(offset)) & ((1n << BigInt(size)) - 1n);
const addr = (w: bigint) => toHex(bits(w, 0, 160), { size: 20 }) as Address;

export function auctionSlot(id: bigint): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [AUCTIONS_SLOT]))) + id * AUCTION_WORDS;
}

export function auctionBidSlot(id: bigint, bidder: Address): bigint {
  const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [id, NFT_BIDS_SLOT]));
  return BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [bidder, inner])));
}

export function decodeAuction([w0, w1, w2, w3, w4]: [bigint, bigint, bigint, bigint, bigint]): AuctionCore {
  return {
    seller: addr(w0),
    bidDeadline: bits(w0, 160, 64),
    bidCount: Number(bits(w0, 224, 32)),
    collection: addr(w1),
    revealDeadline: bits(w1, 160, 64),
    revealedCount: Number(bits(w1, 224, 32)),
    tokenId: w2,
    highestBidder: addr(w3),
    createdBlock: bits(w3, 160, 64),
    settled: bits(w3, 224, 8) === 1n,
    cancelled: bits(w3, 232, 8) === 1n,
    proceedsPaid: bits(w3, 240, 8) === 1n,
    reservePrice: bits(w4, 0, 128),
    highestBid: bits(w4, 128, 128),
  };
}

export function decodeAuctionBid([w0, w1]: [bigint, bigint]): AuctionBidCore {
  return {
    commitment: toHex(w0, { size: 32 }),
    deposit: bits(w1, 0, 112),
    amount: bits(w1, 112, 112),
    revealed: bits(w1, 224, 8) === 1n,
    withdrawn: bits(w1, 232, 8) === 1n,
  };
}

/** Mirror of SealedNFTAuction._state — the contract decides with block.timestamp; `nowSec` is chain time. */
export function auctionState(a: AuctionCore, nowSec: number): AuctionState {
  if (a.cancelled) return AuctionState.Cancelled;
  if (nowSec < Number(a.bidDeadline)) return AuctionState.Open;
  if (nowSec < Number(a.revealDeadline)) return AuctionState.Reveal;
  if (a.highestBidder === ZERO) return AuctionState.NoSale;
  return a.settled ? AuctionState.Settled : AuctionState.Settlement;
}

/** Contract rule NON_REVEAL_PENALTY_BPS (10%). */
export const NON_REVEAL_PENALTY_BPS = 1000n;

/** Mirror of SealedNFTAuction.withdraw: what `account` would receive right now (0 = the call would revert). */
export function withdrawableAmount(a: AuctionCore, bid: AuctionBidCore | undefined, account: Address, nowSec: number): bigint {
  const closed = nowSec >= Number(a.revealDeadline);
  if (account.toLowerCase() === a.seller.toLowerCase()) {
    return a.settled && a.highestBidder !== ZERO && !a.proceedsPaid ? a.highestBid : 0n;
  }
  if (!bid || bid.deposit === 0n || bid.withdrawn) return 0n;
  if (bid.revealed) {
    if (account.toLowerCase() !== a.highestBidder.toLowerCase()) return bid.deposit;
    return closed ? bid.deposit - a.highestBid : 0n;
  }
  return closed ? bid.deposit - (bid.deposit * NON_REVEAL_PENALTY_BPS) / 10_000n : 0n;
}

async function load(client: PublicClient, address: Address, slot: bigint): Promise<bigint> {
  return BigInt((await client.getStorageAt({ address, slot: word(slot) })) ?? "0x0");
}

export async function readAuctionCount(client: PublicClient, address: Address): Promise<bigint> {
  return load(client, address, AUCTIONS_SLOT);
}

export async function readAuction(client: PublicClient, address: Address, id: bigint): Promise<AuctionCore> {
  const base = auctionSlot(id);
  const w = await Promise.all([0n, 1n, 2n, 3n, 4n].map((i) => load(client, address, base + i)));
  return decodeAuction(w as [bigint, bigint, bigint, bigint, bigint]);
}

export async function readAuctionBid(client: PublicClient, address: Address, id: bigint, bidder: Address): Promise<AuctionBidCore> {
  const base = auctionBidSlot(id, bidder);
  const [w0, w1] = await Promise.all([load(client, address, base), load(client, address, base + 1n)]);
  return decodeAuctionBid([w0, w1]);
}
