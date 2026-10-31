import type { Address, Hex } from "viem";

export type Kind = "tender" | "auction";

export type RawLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: string;
  logIndex: number;
  transactionHash: Hex;
  removed?: boolean;
};

/**
 * Everything the checks read. It can be saved and replayed with no network, so a report can be reproduced later or
 * by someone else. Numbers that can exceed 2^53 are decimal strings.
 */
export type Evidence = {
  format: "plinths.evidence/1";
  kind: Kind;
  roundId: string;
  chainId: number;
  contract: Address;
  runtimeCode: Hex;
  /** Result of COMMITMENT_DOMAIN(), null when the contract has no such function. */
  domainTag: Hex | null;
  head: { number: string; timestamp: string; finalized: string | null };
  fromBlock: string;
  logs: RawLog[];
  /** Storage: the rounds array length, the round's words, and two words per bidder seen in the logs. */
  roundCount: string;
  words: Hex[];
  bids: Record<string, [Hex, Hex]>;
  /** Best effort: an RPC may have pruned old blocks and transactions. */
  blockTimes: Record<string, string>;
  txSenders: Record<string, Address>;
  /** Auctions only. */
  nftOwner?: Address | null;
  settleReceiptLogs?: RawLog[] | null;
  rpcCalls: number;
};

export type Result = "VERIFIED" | "FAILED" | "INCOMPLETE" | "UNSUPPORTED";
export type CheckStatus = "PASS" | "FAIL" | "INCOMPLETE" | "NOT_CHECKED" | "UNSUPPORTED";
export type Check = { id: string; status: CheckStatus; required: boolean; detail: string };

export type ExpectedCode = { source: "pinned" | "artifact"; description: string; matches: (code: Hex) => { ok: boolean; note?: string } };

export type VerifyOptions = {
  confirmations: number;
  /** Set when the caller has a compiled artifact, or the deployment is pinned in deployments.json. */
  expectedCode?: ExpectedCode;
  /** Version asserted by the pin or artifact. Without one, it is inferred from COMMITMENT_DOMAIN(). */
  knownVersion?: 1 | 2;
  expectedChainId?: number;
  /** The award reason document's raw bytes, if the caller has them. */
  reasonDocument?: Uint8Array;
};

export type RevealEntry = { bidder: Address; amount: string; commitment: Hex; counted?: boolean; blockNumber: string; logIndex: number; txHash: Hex };

export type Report = {
  schemaVersion: "1.0.0";
  generator: { name: string; version: string };
  result: Result;
  exitCode: number;
  subject: { kind: Kind; roundId: string; chainId: number; contract: Address; contractVersion: 1 | 2 | null; roundDocument: Hex | null };
  outcome: {
    status: string;
    final: boolean;
    winner: Address | null;
    winningAmount: string | null;
    rule: { id: string; version: number; deterministic: boolean; description: string };
    randomness: { used: false; note: string };
  };
  budget: { min: string; max: string } | null;
  revealSet: {
    algorithm: string;
    digest: Hex;
    onChainDigest: Hex | null;
    count: number;
    entries: RevealEntry[];
    notRevealed: Address[];
  };
  references: { label: string; txHash: Hex; blockNumber: string }[];
  documents: { label: string; digest: Hex; cidRaw: string; cidDagPb: string }[];
  evidence: {
    rpcCalls: number;
    logCount: number;
    fromBlock: string;
    headBlock: string;
    headTimestamp: string;
    finalizedBlock: string | null;
  };
  sealing: { amount: string; proposal: string; identity: string };
  checks: Check[];
  limitations: string[];
};

export const EXIT_CODE: Record<Result, number> = { VERIFIED: 0, FAILED: 1, INCOMPLETE: 2, UNSUPPORTED: 3 };
