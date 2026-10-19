import type { Address, Hash, PublicClient } from "viem";
import { blindBidAddress, type Tender } from "./contracts";
import { fetchTenderLogs } from "./market-logs";

export type TimelineEvent = {
  kind: "TenderCreated" | "BidSubmitted" | "BidUpdated" | "BidRevealed" | "TenderAwarded";
  blockNumber: bigint;
  /** 0 when the RPC no longer serves that block (PortaldotV3 nodes prune block state after ~256 blocks). */
  timestamp: bigint;
  txHash: Hash;
  bidder?: Address;
  logIndex: number;
};

/**
 * Builds the on-chain timeline for one tender from its events (one eth_getLogs call; logs stay queryable for old
 * blocks). Block timestamps are best-effort: PortaldotV3's RPC only serves recent blocks, so older events show
 * their block number without a time.
 */
export async function fetchTimeline(client: PublicClient, tenderId: bigint, tender: Tender): Promise<TimelineEvent[]> {
  if (!blindBidAddress) return [];
  const logs = await fetchTenderLogs(client, blindBidAddress, tenderId, tender.createdBlock);
  const events: TimelineEvent[] = [];
  for (const l of logs) {
    const kind: TimelineEvent["kind"] | undefined =
      l.name === "BidSubmitted" ? (l.first ? "BidSubmitted" : "BidUpdated") : l.name === "TenderCreated" || l.name === "BidRevealed" || l.name === "TenderAwarded" ? l.name : undefined;
    if (!kind) continue;
    events.push({
      kind,
      blockNumber: l.blockNumber,
      timestamp: 0n,
      txHash: l.txHash,
      bidder: l.name === "BidSubmitted" || l.name === "BidRevealed" ? l.bidder : l.name === "TenderAwarded" ? l.winner : undefined,
      logIndex: l.logIndex,
    });
  }
  const times = await blockTimestamps(client, events.map((e) => e.blockNumber));
  return events.map((e) => ({ ...e, timestamp: times.get(e.blockNumber) ?? 0n }));
}

/** Timestamps for the blocks the RPC still serves; pruned blocks are simply missing from the map. */
export async function blockTimestamps(client: PublicClient, blocks: bigint[]): Promise<Map<bigint, bigint>> {
  const out = new Map<bigint, bigint>();
  await Promise.all(
    [...new Set(blocks.filter((b) => b > 0n))].map(async (b) => {
      const block = await client.getBlock({ blockNumber: b }).catch(() => undefined);
      if (block) out.set(b, block.timestamp);
    }),
  );
  return out;
}
