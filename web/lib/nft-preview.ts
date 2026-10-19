import { zeroAddress, zeroHash, type Address } from "viem";
import { AuctionState, type Auction, type AuctionBid, type AuctionRow } from "./nft-auction";

/*
 * Preview data for the NFT pages while no auction contract is configured. The three items are the real
 * Plinths test NFTs (artwork + metadata already on IPFS, contracts/scripts/test-nft/uris.json); auctions,
 * bidders and amounts are illustrative.
 */

export const PREVIEW_COLLECTION: Address = "0x7e57000000000000000000000000000000000001";
const SELLER: Address = "0x1111111111111111111111111111111111111111";
const A: Address = "0x2222222222222222222222222222222222222222";
const B: Address = "0x3333333333333333333333333333333333333333";
const C: Address = "0x4444444444444444444444444444444444444444";
const D: Address = "0x5555555555555555555555555555555555555555";

export const PREVIEW_TOKENS: { tokenId: bigint; tokenURI: string }[] = [
  { tokenId: 1n, tokenURI: "ipfs://bafkreif7giatkqukhopkiz6edvna7culo6vw255n67fpjvx2ne4u4nw4sq" },
  { tokenId: 2n, tokenURI: "ipfs://bafkreibmv2d7pnxrbudzgc62ftwvxcxv42llvwp2etfs3fhmpb23max6ya" },
  { tokenId: 3n, tokenURI: "ipfs://bafkreifnkrbsirsexluo4xfwmuopfgs4gdazupwmclgapzx4tffdtnhnka" },
];

export function previewTokenURI(tokenId: bigint): string | undefined {
  return PREVIEW_TOKENS.find((t) => t.tokenId === tokenId)?.tokenURI;
}

const T = (n: number) => BigInt(n) * 10n ** 18n;
const H = 3600;

type Preview = { row: AuctionRow; bids: { bidder: Address; bid: AuctionBid }[] };

/** Built from the device clock at call time; callers keep the result stable (useState initialiser). */
export function buildPreviewAuctions(): Preview[] {
  const now = Math.floor(Date.now() / 1000);
  const at = (h: number) => BigInt(now + h * H);
  const auction = (p: Partial<Auction> & Pick<Auction, "tokenId" | "bidDeadline" | "revealDeadline">): Auction => ({
    seller: SELLER,
    collection: PREVIEW_COLLECTION,
    createdBlock: 1_204_000n,
    bidCount: 0,
    revealedCount: 0,
    settled: false,
    cancelled: false, proceedsPaid: false,
    reservePrice: 0n,
    highestBidder: zeroAddress,
    highestBid: 0n,
    ...p,
  });
  const sealed = (deposit: number, hoursAgo: number): AuctionBid => ({
    commitment: `0x${(deposit * 7919 + hoursAgo).toString(16).padStart(64, "a")}`,
    deposit: T(deposit),
    committedAt: BigInt(now - hoursAgo * H),
    committedBlock: 1_204_100n + BigInt(hoursAgo),
    revealed: false,
    withdrawn: false,
    amount: 0n,
    salt: zeroHash,
  });
  const revealed = (b: AuctionBid, amount: number): AuctionBid => ({ ...b, revealed: true, amount: T(amount), salt: `0x${"5a".repeat(32)}` });

  return [
    {
      row: {
        id: 0n,
        state: AuctionState.Open,
        auction: auction({ tokenId: 1n, bidDeadline: at(46), revealDeadline: at(82), reservePrice: T(50), bidCount: 3 }),
      },
      bids: [
        { bidder: A, bid: sealed(180, 20) },
        { bidder: B, bid: sealed(95, 9) },
        { bidder: C, bid: sealed(260, 2) },
      ],
    },
    {
      row: {
        id: 1n,
        state: AuctionState.Reveal,
        auction: auction({
          tokenId: 2n,
          bidDeadline: at(-8),
          revealDeadline: at(16),
          reservePrice: T(80),
          bidCount: 4,
          revealedCount: 2,
          highestBidder: B,
          highestBid: T(120),
        }),
      },
      bids: [
        { bidder: A, bid: revealed(sealed(150, 40), 104) },
        { bidder: B, bid: revealed(sealed(200, 30), 120) },
        { bidder: C, bid: sealed(140, 20) },
        { bidder: D, bid: sealed(90, 12) },
      ],
    },
    {
      row: {
        id: 2n,
        state: AuctionState.Settled,
        auction: auction({
          tokenId: 3n,
          bidDeadline: at(-96),
          revealDeadline: at(-70),
          bidCount: 4,
          revealedCount: 3,
          settled: true,
          highestBidder: C,
          highestBid: T(210),
        }),
      },
      bids: [
        { bidder: A, bid: revealed(sealed(250, 120), 175) },
        { bidder: B, bid: revealed(sealed(150, 110), 160) },
        { bidder: C, bid: revealed(sealed(300, 100), 210) },
        { bidder: D, bid: sealed(120, 98) },
      ],
    },
  ];
}
