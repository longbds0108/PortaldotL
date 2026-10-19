import type { Address, Hash, Hex } from "viem";
import { computeCommitment } from "./commitment";
import type { BidCore, TenderCore } from "./market-storage";
import type { MarketLog } from "./market-logs";
import { computeNftCommitment } from "./nft-commitment";
import type { NftAuctionLog } from "./nft-logs";
import type { AuctionBidCore, AuctionCore } from "./nft-storage";

/*
 * Verification Engine for disputes that on-chain data can settle by itself: late bids or reveals, reveals that do
 * not open their commitment, and NFTs / deposits / bonds after settlement. It only uses public chain data (storage
 * + events), so anyone running it gets the same result. The contracts already enforce these rules; the engine
 * shows that they were applied to this tender or auction, with the transactions that prove it.
 */

export type CheckStatus = "pass" | "fail" | "pending" | "unknown";
export type CheckItem = { label: string; status: CheckStatus; detail: string; txHash?: Hash };
export type EngineCheck = { key: "deadlines" | "reveals" | "settlement"; title: string; status: CheckStatus; summary: string; items: CheckItem[] };

export type TenderData = { core: TenderCore; logs: MarketLog[]; bids: Map<string, BidCore> };
export type AuctionData = { core: AuctionCore; logs: NftAuctionLog[]; bids: Map<string, AuctionBidCore>; nftOwner?: Address };

const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function overall(items: CheckItem[], empty: string): { status: CheckStatus; summary: string } {
  if (items.some((i) => i.status === "fail")) return { status: "fail", summary: `${items.filter((i) => i.status === "fail").length} problem(s) found.` };
  if (!items.length) return { status: "pass", summary: empty };
  if (items.some((i) => i.status === "pending")) return { status: "pending", summary: "Not finished yet — see below." };
  if (items.every((i) => i.status === "unknown")) return { status: "unknown", summary: "The RPC no longer serves these blocks' times; the contract enforced the deadlines when they were sent." };
  return { status: "pass", summary: "Every item checks out." };
}

/** A transaction time against a window; block times may be missing for old blocks (pruned RPC). */
function timeItem(label: string, at: bigint | undefined, from: bigint | undefined, to: bigint, txHash: Hash): CheckItem {
  if (!at) return { label, status: "unknown", detail: "Block time unavailable from the RPC; accepted by the contract, which checks the deadline itself.", txHash };
  const ok = (from === undefined || at >= from) && at < to;
  return { label, status: ok ? "pass" : "fail", detail: ok ? "Inside the allowed window." : "Outside the allowed window.", txHash };
}

// ───────────────────────── tenders ─────────────────────────

export function tenderChecks(t: TenderData, times: Map<bigint, bigint>, nowSec: number): EngineCheck[] {
  const { core, logs } = t;
  const at = (b: bigint) => times.get(b);

  const deadlineItems: CheckItem[] = logs.flatMap((l) =>
    l.name === "BidSubmitted"
      ? [timeItem(`Bid ${l.first ? "sealed" : "replaced"} by ${short(l.bidder)}`, at(l.blockNumber), undefined, core.submissionDeadline, l.txHash)]
      : l.name === "BidRevealed"
        ? [timeItem(`Reveal by ${short(l.bidder)}`, at(l.blockNumber), core.submissionDeadline, core.revealDeadline, l.txHash)]
        : [],
  );

  // The commitment in force at reveal time is the last BidSubmitted before it.
  const lastCommit = new Map<string, Hex>();
  const revealItems: CheckItem[] = [];
  for (const l of logs) {
    if (l.name === "BidSubmitted") lastCommit.set(l.bidder.toLowerCase(), l.commitment);
    if (l.name === "BidRevealed") {
      const sealed = lastCommit.get(l.bidder.toLowerCase());
      const recomputed = computeCommitment({ tenderId: l.tenderId, bidder: l.bidder, amount18: l.amount, salt: l.salt, docKey: l.docKey });
      const ok = !!sealed && recomputed.toLowerCase() === sealed.toLowerCase();
      revealItems.push({
        label: `Reveal by ${short(l.bidder)}`,
        status: ok ? "pass" : "fail",
        detail: ok ? "Price, salt and key hash back to the sealed commitment." : "Does not hash back to the sealed commitment.",
        txHash: l.txHash,
      });
    }
  }

  const settlementItems: CheckItem[] = [];
  const closed = nowSec >= Number(core.revealDeadline);
  for (const [bidder, b] of t.bids) {
    if (b.bond === 0n) continue;
    const label = `Bond of ${short(bidder)}`;
    if (b.revealed) {
      settlementItems.push({ label, status: "pass", detail: b.bondWithdrawn ? "Revealed; bond withdrawn." : "Revealed; bond available to withdraw at any time." });
    } else if (!closed) {
      settlementItems.push({ label, status: "pending", detail: "Not revealed yet; the reveal window is still open." });
    } else {
      settlementItems.push({
        label,
        status: "pass",
        detail: core.forfeitSwept ? "Not revealed; forfeited to the treasury (never to the buyer)." : "Not revealed; forfeited — anyone can send it to the treasury.",
      });
    }
  }

  return [
    { key: "deadlines", title: "Deadlines", ...overall(deadlineItems, "No bids or reveals to check."), items: deadlineItems },
    { key: "reveals", title: "Reveals match commitments", ...overall(revealItems, "No reveals yet."), items: revealItems },
    { key: "settlement", title: "Bonds after the tender", ...overall(settlementItems, "This tender has no bonds."), items: settlementItems },
  ];
}

// ───────────────────────── NFT auctions ─────────────────────────

export function auctionChecks(a: AuctionData, times: Map<bigint, bigint>, nowSec: number): EngineCheck[] {
  const { core, logs } = a;
  const at = (b: bigint) => times.get(b);

  const deadlineItems: CheckItem[] = logs.flatMap((l) =>
    l.name === "BidPlaced"
      ? [timeItem(`Bid ${l.first ? "sealed" : "replaced"} by ${short(l.bidder)}`, at(l.blockNumber), undefined, core.bidDeadline, l.txHash)]
      : l.name === "BidRevealed"
        ? [timeItem(`Reveal by ${short(l.bidder)}`, at(l.blockNumber), core.bidDeadline, core.revealDeadline, l.txHash)]
        : [],
  );

  const lastCommit = new Map<string, Hex>();
  const revealItems: CheckItem[] = [];
  for (const l of logs) {
    if (l.name === "BidPlaced") lastCommit.set(l.bidder.toLowerCase(), l.commitment);
    if (l.name === "BidRevealed") {
      const sealed = lastCommit.get(l.bidder.toLowerCase());
      const ok = !!sealed && computeNftCommitment({ auctionId: l.auctionId, bidder: l.bidder, amount18: l.amount, salt: l.salt }).toLowerCase() === sealed.toLowerCase();
      revealItems.push({
        label: `Reveal by ${short(l.bidder)}`,
        status: ok ? "pass" : "fail",
        detail: ok ? `Hashes back to the sealed bid${l.counted ? "; counted." : "; not counted (reserve, deposit or lower than the leader)."}` : "Does not hash back to the sealed bid.",
        txHash: l.txHash,
      });
    }
  }

  const settlementItems: CheckItem[] = [];
  const settled = logs.find((l) => l.name === "AuctionSettled");
  const cancelled = logs.find((l) => l.name === "AuctionCancelled");
  const winner = core.highestBidder !== ZERO ? core.highestBidder : undefined;
  if (cancelled) {
    settlementItems.push({ label: "NFT", status: "pass", detail: "Cancelled before any bid; the NFT went back to the seller in the same transaction.", txHash: cancelled.txHash });
  } else if (nowSec < Number(core.revealDeadline)) {
    settlementItems.push({ label: "NFT", status: "pending", detail: "The auction is still running; the NFT stays in the auction contract." });
  } else if (!settled) {
    settlementItems.push({ label: "NFT", status: "pending", detail: "Ready to settle. Anyone can call Settle; until then the NFT and the deposits stay in the contract." });
  } else {
    const to = winner ?? core.seller;
    const owner = a.nftOwner;
    settlementItems.push({
      label: "NFT",
      status: "pass",
      detail: `Delivered to ${winner ? "the winner" : "the seller"} ${short(to)} in the settle transaction (it reverts if the transfer fails).${owner && owner.toLowerCase() !== to.toLowerCase() ? ` It has moved since; current owner ${short(owner)}.` : ""}`,
      txHash: settled.txHash,
    });
    if (winner) {
      settlementItems.push({ label: "Seller proceeds", status: "pass", detail: core.proceedsPaid ? "Withdrawn by the seller." : "Available for the seller to withdraw." });
    }
  }
  for (const [bidder, b] of a.bids) {
    if (b.deposit === 0n) continue;
    const isWinner = !!winner && bidder.toLowerCase() === winner.toLowerCase();
    const closedNow = nowSec >= Number(core.revealDeadline);
    let detail: string;
    let status: CheckStatus = "pass";
    if (b.withdrawn) detail = "Withdrawn.";
    else if (b.revealed && !isWinner) detail = "Outbid or not counted; full deposit available to withdraw.";
    else if (!closedNow) {
      status = "pending";
      detail = b.revealed ? "Leading; locked until the reveal deadline." : "Not revealed yet.";
    } else detail = isWinner ? "Winner; deposit above the price available to withdraw." : "Not revealed; deposit minus 10% available to withdraw.";
    settlementItems.push({ label: `Deposit of ${short(bidder)}`, status, detail });
  }

  return [
    { key: "deadlines", title: "Deadlines", ...overall(deadlineItems, "No bids or reveals to check."), items: deadlineItems },
    { key: "reveals", title: "Reveals match sealed bids", ...overall(revealItems, "No reveals yet."), items: revealItems },
    { key: "settlement", title: "NFT and payouts after settlement", ...overall(settlementItems, "Nothing to settle."), items: settlementItems },
  ];
}
