import { decodeEventLog, pad, toHex, toEventSelector, type Address, type Hash, type Hex, type Log, type PublicClient } from "viem";
import { blindBidMarketAbi } from "./abi";

/*
 * Everything BlindBidMarket only displays lives in events (see IBlindBidMarket): metadata / proposal / reason
 * digests, budgets, revealed salts and keys, bidder lists. Every event's first indexed topic is the tenderId,
 * and buyer / bidder are the second, so each query below is one eth_getLogs call.
 */

export type MarketEvent =
  | { name: "TenderCreated"; tenderId: bigint; buyer: Address; metadata: Hex; budgetMin: bigint; budgetMax: bigint }
  | { name: "BidSubmitted"; tenderId: bigint; bidder: Address; commitment: Hex; encryptedDoc: Hex; first: boolean }
  | { name: "BidRevealed"; tenderId: bigint; bidder: Address; amount: bigint; salt: Hex; docKey: Hex }
  | { name: "TenderAwarded"; tenderId: bigint; winner: Address; amount: bigint; reason: Hex }
  | { name: "TenderCancelled"; tenderId: bigint }
  | { name: "BondWithdrawn"; tenderId: bigint; bidder: Address; amount: bigint }
  | { name: "ForfeitedBondsSwept"; tenderId: bigint; amount: bigint };

export type MarketLog = MarketEvent & { blockNumber: bigint; txHash: Hash; logIndex: number };

const topicOf = (name: string) => {
  const item = blindBidMarketAbi.find((x) => x.type === "event" && x.name === name);
  if (!item || item.type !== "event") throw new Error(`Unknown event ${name}`);
  return toEventSelector(item);
};
export const TENDER_CREATED = topicOf("TenderCreated");
export const BID_SUBMITTED = topicOf("BidSubmitted");

const uintTopic = (n: bigint) => toHex(n, { size: 32 });
const addressTopic = (a: Address) => pad(a.toLowerCase() as Hex, { size: 32 });

function decode(logs: Log[]): MarketLog[] {
  const out: MarketLog[] = [];
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi: blindBidMarketAbi, data: log.data, topics: log.topics });
      out.push({
        ...({ name: d.eventName, ...(d.args as object) } as MarketEvent),
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
        logIndex: log.logIndex ?? 0,
      });
    } catch {
      // not one of ours
    }
  }
  return out.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}

async function getLogs(client: PublicClient, address: Address, fromBlock: bigint, topics: (Hex | null)[]): Promise<MarketLog[]> {
  const logs = await client.request({
    method: "eth_getLogs",
    params: [{ address, fromBlock: toHex(fromBlock), toBlock: "latest", topics }],
  });
  return decode(
    (logs as Log<Hex, Hex>[]).map((l) => ({
      ...l,
      blockNumber: l.blockNumber != null ? BigInt(l.blockNumber) : null,
      logIndex: l.logIndex != null ? Number(l.logIndex) : null,
    })) as Log[],
  );
}

/** All events of one tender, oldest first. `fromBlock` = its createdBlock. */
export function fetchTenderLogs(client: PublicClient, address: Address, tenderId: bigint, fromBlock: bigint) {
  return getLogs(client, address, fromBlock, [null, uintTopic(tenderId)]);
}

/** Every TenderCreated (metadata + budget for list pages), optionally only one buyer's. */
export async function fetchCreatedLogs(client: PublicClient, address: Address, fromBlock: bigint, buyer?: Address) {
  const logs = await getLogs(client, address, fromBlock, [TENDER_CREATED, null, buyer ? addressTopic(buyer) : null]);
  return logs.filter((l): l is MarketLog & Extract<MarketEvent, { name: "TenderCreated" }> => l.name === "TenderCreated");
}

/** Ids of tenders a wallet has bid on (from its first BidSubmitted per tender). */
export async function fetchBidderTenderIds(client: PublicClient, address: Address, fromBlock: bigint, bidder: Address) {
  const logs = await getLogs(client, address, fromBlock, [BID_SUBMITTED, null, addressTopic(bidder)]);
  return [...new Set(logs.map((l) => l.tenderId))];
}
