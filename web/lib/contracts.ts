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

export type Tender = {
  buyer: Address;
  submissionDeadline: bigint;
  revealDeadline: bigint;
  createdBlock: bigint;
  awardedBlock: bigint;
  winner: Address;
  bidCount: number;
  revealedCount: number;
  cancelled: boolean;
  awarded: boolean;
  forfeitSwept: boolean;
  budgetMin: bigint;
  budgetMax: bigint;
  bidBond: bigint;
  metadataURI: string;
  reasonURI: string;
};

export type Bid = {
  commitment: Hex;
  encryptedDocURI: string;
  committedAt: bigint;
  committedBlock: bigint;
  revealedBlock: bigint;
  revealed: boolean;
  bondWithdrawn: boolean;
  bond: bigint;
  amount: bigint;
  salt: Hex;
  docKey: Hex;
};

/** Contract custom errors → user-facing text. */
export const ERROR_TEXT: Record<string, string> = {
  TenderNotFound: "This tender does not exist.",
  InvalidState: "This action is not allowed in the tender's current phase.",
  InvalidDeadlines: "Deadlines are invalid: submission must be in the future and the reveal window at least 24 hours.",
  InvalidBudget: "Minimum budget must not exceed maximum budget.",
  EmptyURI: "Missing document reference.",
  NotBuyer: "Only the tender's buyer can do this.",
  BuyerCannotBid: "Buyers cannot bid on their own tender.",
  AlreadyBid: "You already have a bid on this tender — update it instead.",
  NoBid: "You have no bid on this tender.",
  ZeroCommitment: "Invalid commitment.",
  WrongBond: "The bid bond sent does not match the tender's bond.",
  AlreadyRevealed: "This bid is already revealed.",
  CommitmentMismatch: "Amount, salt or document key does not match your sealed commitment. Check your backup file.",
  ZeroAmount: "Bid amount must be greater than zero.",
  WinnerNotRevealed: "The selected bidder did not reveal a valid bid.",
  HasBids: "A tender with bids can no longer be cancelled.",
  NothingToWithdraw: "Nothing to withdraw.",
  TransferFailed: "The tPOTv3 transfer failed. Check the wallet and retry.",
  ZeroTreasury: "Treasury address is not set.",
};
