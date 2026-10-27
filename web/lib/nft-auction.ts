import { encodeAbiParameters, type Address, type Hex } from "viem";
import { NFT_AUCTION_ADDRESS } from "./env";
import type { Text } from "./i18n";
import { sealedNftAuctionAbi } from "./nft-abi";

/*
 * Sealed-bid NFT auctions. Everything here follows contracts/src/interfaces/ISealedNFTAuction.sol
 * (implementation: SealedNFTAuction.sol), plugged in with NEXT_PUBLIC_NFT_AUCTION_ADDRESS.
 */

export { sealedNftAuctionAbi };
export const nftAuctionAddress = NFT_AUCTION_ADDRESS;

/** Contract rule: reveal window must last at least this long (ISealedNFTAuction.MIN_REVEAL_WINDOW). */
export const NFT_MIN_REVEAL_WINDOW_S = 24 * 60 * 60;

/** Mirrors ISealedNFTAuction.AuctionState (enum order matters). */
export enum AuctionState {
  Open = 0,
  Reveal = 1,
  Settlement = 2,
  Settled = 3,
  NoSale = 4,
  Cancelled = 5,
}

export const AUCTION_STATE_LABEL: Record<AuctionState, Text> = {
  [AuctionState.Open]: ["Open", "Đang mở"],
  [AuctionState.Reveal]: ["Reveal", "Công bố"],
  [AuctionState.Settlement]: ["Settlement", "Chờ kết thúc"],
  [AuctionState.Settled]: ["Sold", "Đã bán"],
  [AuctionState.NoSale]: ["No sale", "Không bán được"],
  [AuctionState.Cancelled]: ["Cancelled", "Đã hủy"],
};

/** Revealed amounts may be shown only once bidding has closed (Reveal onwards); before that nothing exists to show. */
export function revealedAmountsVisible(state: AuctionState | undefined): boolean {
  return state !== undefined && state !== AuctionState.Open;
}

export type Auction = {
  seller: Address;
  collection: Address;
  tokenId: bigint;
  bidDeadline: bigint;
  revealDeadline: bigint;
  createdBlock: bigint;
  bidCount: number;
  revealedCount: number;
  settled: boolean;
  cancelled: boolean;
  proceedsPaid: boolean;
  reservePrice: bigint;
  highestBidder: Address;
  highestBid: bigint;
};

export type AuctionBid = {
  commitment: Hex;
  deposit: bigint;
  committedAt: bigint;
  committedBlock: bigint;
  revealed: boolean;
  withdrawn: boolean;
  amount: bigint;
  salt: Hex;
};

export type AuctionRow = { id: bigint; auction: Auction; state: AuctionState };

/** `data` for IERC721.safeTransferFrom(seller, auction, tokenId, data): abi.encode(reserve, bidDeadline, revealDeadline). */
export function encodeListingData(p: { reserve18: bigint; bidDeadline: bigint; revealDeadline: bigint }): Hex {
  return encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }], [p.reserve18, p.bidDeadline, p.revealDeadline]);
}

/** Minimal ERC-721 surface the app reads and writes. */
export const erc721Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "supportsInterface", stateMutability: "view", inputs: [{ name: "interfaceId", type: "bytes4" }], outputs: [{ type: "bool" }] },
  // PlinthsTestNFT's errors, so a failed listing shows a readable reason
  { type: "error", name: "NotAuthorized", inputs: [] },
  { type: "error", name: "UnsafeRecipient", inputs: [] },
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const ERC721_INTERFACE_ID = "0x80ac58cd";
export const ERC721_ENUMERABLE_INTERFACE_ID = "0x780e9d63";

/** Contract custom errors → user-facing text. */
export const NFT_ERROR_TEXT: Record<string, Text> = {
  AuctionNotFound: ["This auction does not exist.", "Phiên đấu giá này không tồn tại."],
  InvalidState: ["This action is not allowed in the auction's current phase.", "Không thể làm thao tác này ở giai đoạn hiện tại của phiên đấu giá."],
  InvalidDeadlines: [
    "Deadlines are invalid: bidding must end in the future and the reveal window must last at least 24 hours.",
    "Thời hạn không hợp lệ: hạn đặt giá phải ở tương lai và cửa sổ công bố dài ít nhất 24 giờ.",
  ],
  InvalidListingData: ["The listing data is malformed.", "Dữ liệu đăng bán bị sai định dạng."],
  NotSeller: ["Only the seller can do this.", "Chỉ người bán mới làm được việc này."],
  SellerCannotBid: ["Sellers cannot bid on their own auction.", "Người bán không được đặt giá vào phiên đấu giá của chính mình."],
  NoBid: ["You have no bid on this auction.", "Bạn chưa đặt giá trong phiên đấu giá này."],
  ZeroCommitment: ["Invalid commitment.", "Commitment không hợp lệ."],
  AlreadyRevealed: ["This bid is already revealed.", "Giá này đã được công bố."],
  CommitmentMismatch: [
    "Amount or salt does not match your sealed commitment. Check your backup file.",
    "Giá hoặc salt không khớp với commitment đã niêm phong. Hãy kiểm tra file sao lưu.",
  ],
  ZeroAmount: ["Bid amount must be greater than zero.", "Giá đặt phải lớn hơn 0."],
  HasBids: ["An auction with bids can no longer be cancelled.", "Phiên đấu giá đã có người đặt giá thì không thể hủy nữa."],
  NothingToWithdraw: ["Nothing to withdraw.", "Không có gì để rút."],
  TransferFailed: ["The tPOTv3 transfer failed. Check the wallet and retry.", "Chuyển tPOTv3 thất bại. Hãy kiểm tra ví rồi thử lại."],
  ZeroDeposit: ["Send a deposit with your sealed bid.", "Hãy gửi kèm tiền đặt cọc với giá niêm phong."],
  NotAuthorized: ["Only the owner of this NFT can transfer or list it.", "Chỉ chủ sở hữu NFT này mới chuyển hoặc đăng bán được."],
  UnsafeRecipient: ["The auction contract did not accept the NFT.", "Contract đấu giá không nhận NFT này."],
  ERC721IncorrectOwner: ["This wallet does not own that NFT.", "Ví này không sở hữu NFT đó."],
  ERC721InsufficientApproval: ["This wallet is not allowed to transfer that NFT.", "Ví này không có quyền chuyển NFT đó."],
  ERC721NonexistentToken: ["That token does not exist in this collection.", "Token đó không tồn tại trong bộ sưu tập này."],
};
