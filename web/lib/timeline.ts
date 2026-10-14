import { decodeEventLog, type Address, type Hash, type PublicClient } from "viem";
import { blindBidAddress, blindBidMarketAbi, type Tender } from "./contracts";
import type { BidRow } from "./hooks";

export type TimelineEvent = {
  kind: "TenderCreated" | "BidSubmitted" | "BidUpdated" | "BidRevealed" | "TenderAwarded";
  blockNumber: bigint;
  timestamp: bigint;
  txHash: Hash;
  bidder?: Address;
  logIndex: number;
};

const KINDS = new Set<TimelineEvent["kind"]>([
  "TenderCreated",
  "BidSubmitted",
  "BidUpdated",
  "BidRevealed",
  "TenderAwarded",
]);

/**
 * Builds the on-chain timeline for one tender.
 * Instead of scanning potentially large eth_getLogs ranges, query the exact blocks recorded by the contract
 * we query the exact blocks the contract recorded (createdBlock, committedBlock, revealedBlock, awardedBlock).
 * Note: for an updated bid only the latest commitment's block is recorded.
 */
export async function fetchTimeline(
  client: PublicClient,
  tenderId: bigint,
  tender: Tender,
  bids: BidRow[],
): Promise<TimelineEvent[]> {
  if (!blindBidAddress) return [];
  const blocks = new Set<bigint>([tender.createdBlock]);
  for (const { bid } of bids) {
    if (bid.committedBlock > 0n) blocks.add(bid.committedBlock);
    if (bid.revealedBlock > 0n) blocks.add(bid.revealedBlock);
  }
  if (tender.awardedBlock > 0n) blocks.add(tender.awardedBlock);

  const perBlock = await Promise.all(
    [...blocks].map(async (blockNumber) => {
      const [logs, block] = await Promise.all([
        client.getLogs({ address: blindBidAddress, fromBlock: blockNumber, toBlock: blockNumber }),
        client.getBlock({ blockNumber }),
      ]);
      const events: TimelineEvent[] = [];
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({ abi: blindBidMarketAbi, data: log.data, topics: log.topics });
          const args = decoded.args as { tenderId?: bigint; bidder?: Address; winner?: Address };
          if (!KINDS.has(decoded.eventName as TimelineEvent["kind"]) || args.tenderId !== tenderId) continue;
          events.push({
            kind: decoded.eventName as TimelineEvent["kind"],
            blockNumber,
            timestamp: block.timestamp,
            txHash: log.transactionHash!,
            bidder: args.bidder ?? args.winner,
            logIndex: log.logIndex ?? 0,
          });
        } catch {
          // not one of ours
        }
      }
      return events;
    }),
  );

  return perBlock
    .flat()
    .sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
}
