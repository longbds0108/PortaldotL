import type { Address, Hex } from "viem";
import { blindBidMarketAbi } from "./abi";
import { BLINDBID_ADDRESS } from "./env";
import type { Text } from "./i18n";

export { blindBidMarketAbi };
export const blindBidAddress = BLINDBID_ADDRESS;

/** Contract rule: reveal window must last at least this long (BlindBidMarket.MIN_REVEAL_WINDOW). */
export const MIN_REVEAL_WINDOW_S = 24 * 60 * 60;

/** Mirrors IBlindBidMarket.TenderState (enum order matters). */
export enum TenderState {
  Open = 0,
  Reveal = 1,
  Evaluation = 2,
  Awarded = 3,
  Cancelled = 4,
  Failed = 5,
}

export const STATE_LABEL: Record<TenderState, Text> = {
  [TenderState.Open]: ["Open", "Đang mở"],
  [TenderState.Reveal]: ["Reveal", "Công bố"],
  [TenderState.Evaluation]: ["Evaluation", "Đánh giá"],
  [TenderState.Awarded]: ["Awarded", "Đã trao thầu"],
  [TenderState.Cancelled]: ["Cancelled", "Đã hủy"],
  [TenderState.Failed]: ["Failed", "Thất bại"],
};

/** Bid amounts may be shown only in these states (CLAUDE.md §8), even to the buyer. */
export function pricesVisible(state: TenderState | undefined): boolean {
  return state === TenderState.Evaluation || state === TenderState.Awarded;
}

/**
 * Tender as the app sees it: contract storage (lib/market-storage.ts) merged with its events (lib/market-logs.ts).
 * Document fields hold `digest://…` URIs (lib/cid.ts); "" when absent. Amounts are 18-decimal EVM units.
 */
export type Tender = {
  buyer: Address;
  submissionDeadline: bigint;
  revealDeadline: bigint;
  createdBlock: bigint;
  awardedBlock: bigint; // 0 until awarded
  winner: Address;
  bidCount: number;
  revealedCount: number;
  cancelled: boolean;
  awarded: boolean;
  forfeitSwept: boolean;
  budgetMin: bigint; // from TenderCreated
  budgetMax: bigint; // from TenderCreated
  bidBond: bigint;
  metadataURI: string; // from TenderCreated
  reasonURI: string; // from TenderAwarded; the reason document links the optional AI report
};

/** Bid as the app sees it (storage + BidSubmitted / BidRevealed events). */
export type Bid = {
  commitment: Hex;
  encryptedDocURI: string; // latest BidSubmitted
  committedAt: bigint; // timestamp of the latest BidSubmitted
  committedBlock: bigint;
  revealedBlock: bigint; // 0 until revealed
  revealed: boolean;
  bondWithdrawn: boolean;
  bond: bigint;
  amount: bigint; // 0 until revealed
  salt: Hex; // from BidRevealed, zero until revealed
  docKey: Hex; // from BidRevealed, zero until revealed
};

/** Bonds of unrevealed bids the treasury can claim now (contract: sweepForfeitedBonds). */
export function forfeitedBonds(tender: Tender, nowSec: number | undefined): bigint {
  if (nowSec === undefined || nowSec < Number(tender.revealDeadline) || tender.forfeitSwept) return 0n;
  return tender.bidBond * BigInt(tender.bidCount - tender.revealedCount);
}

/** Contract custom errors → user-facing text. */
export const ERROR_TEXT: Record<string, Text> = {
  TenderNotFound: ["This tender does not exist.", "Gói thầu này không tồn tại."],
  InvalidState: ["This action is not allowed in the tender's current phase.", "Không thể làm thao tác này ở giai đoạn hiện tại của gói thầu."],
  InvalidDeadlines: [
    "Deadlines are invalid: submission must be in the future and the reveal window at least 24 hours.",
    "Thời hạn không hợp lệ: hạn nộp phải ở tương lai và cửa sổ công bố dài ít nhất 24 giờ.",
  ],
  InvalidBudget: ["Minimum budget must not exceed maximum budget.", "Ngân sách tối thiểu không được lớn hơn ngân sách tối đa."],
  EmptyDocument: ["Missing document reference.", "Thiếu tham chiếu tài liệu."],
  NotBuyer: ["Only the tender's buyer can do this.", "Chỉ bên mời thầu của gói thầu mới làm được việc này."],
  BuyerCannotBid: ["Buyers cannot bid on their own tender.", "Bên mời thầu không được dự thầu vào gói thầu của chính mình."],
  NoBid: ["You have no bid on this tender.", "Bạn chưa có hồ sơ thầu nào cho gói thầu này."],
  ZeroCommitment: ["Invalid commitment.", "Commitment không hợp lệ."],
  WrongBond: [
    "The bid bond sent does not match the tender's bond (a replacement bid sends none).",
    "Tiền bảo đảm gửi kèm không khớp với mức của gói thầu (gửi lại hồ sơ thay thế thì không gửi thêm).",
  ],
  AlreadyRevealed: ["This bid is already revealed.", "Hồ sơ thầu này đã được công bố."],
  CommitmentMismatch: [
    "Amount, salt or document key does not match your sealed commitment. Check your backup file.",
    "Giá, salt hoặc khóa hồ sơ không khớp với commitment đã niêm phong. Hãy kiểm tra file sao lưu.",
  ],
  ZeroAmount: ["Bid amount must be greater than zero.", "Giá thầu phải lớn hơn 0."],
  WinnerNotRevealed: ["The selected bidder did not reveal a valid bid.", "Nhà thầu được chọn chưa công bố hồ sơ hợp lệ."],
  HasBids: ["A tender with bids can no longer be cancelled.", "Gói thầu đã có hồ sơ thì không thể hủy nữa."],
  NothingToWithdraw: ["Nothing to withdraw.", "Không có gì để rút."],
  TransferFailed: ["The tPOTv3 transfer failed. Check the wallet and retry.", "Chuyển tPOTv3 thất bại. Hãy kiểm tra ví rồi thử lại."],
  ZeroTreasury: ["Treasury address is not set.", "Chưa đặt địa chỉ treasury."],
  ReentrancyGuardReentrantCall: ["Another payout is in progress. Retry in a moment.", "Một khoản chi trả khác đang xử lý. Hãy thử lại sau giây lát."],
};
