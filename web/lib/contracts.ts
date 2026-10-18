import type { Address, Hex } from "viem";
import { blindBidMarketAbi } from "./abi";
import { BLINDBID_ADDRESS } from "./env";

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

export const STATE_LABEL: Record<TenderState, string> = {
  [TenderState.Open]: "Open",
  [TenderState.Reveal]: "Reveal",
  [TenderState.Evaluation]: "Evaluation",
  [TenderState.Awarded]: "Awarded",
  [TenderState.Cancelled]: "Cancelled",
  [TenderState.Failed]: "Failed",
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
export const ERROR_TEXT: Record<string, string> = {
  TenderNotFound: "This tender does not exist.",
  InvalidState: "This action is not allowed in the tender's current phase.",
  InvalidDeadlines: "Deadlines are invalid: submission must be in the future and the reveal window at least 24 hours.",
  InvalidBudget: "Minimum budget must not exceed maximum budget.",
  EmptyDocument: "Missing document reference.",
  NotBuyer: "Only the tender's buyer can do this.",
  BuyerCannotBid: "Buyers cannot bid on their own tender.",
  NoBid: "You have no bid on this tender.",
  ZeroCommitment: "Invalid commitment.",
  WrongBond: "The bid bond sent does not match the tender's bond (a replacement bid sends none).",
  AlreadyRevealed: "This bid is already revealed.",
  CommitmentMismatch: "Amount, salt or document key does not match your sealed commitment. Check your backup file.",
  ZeroAmount: "Bid amount must be greater than zero.",
  WinnerNotRevealed: "The selected bidder did not reveal a valid bid.",
  HasBids: "A tender with bids can no longer be cancelled.",
  NothingToWithdraw: "Nothing to withdraw.",
  TransferFailed: "The tPOTv3 transfer failed. Check the wallet and retry.",
  ZeroTreasury: "Treasury address is not set.",
  ReentrancyGuardReentrantCall: "Another payout is in progress. Retry in a moment.",
};
