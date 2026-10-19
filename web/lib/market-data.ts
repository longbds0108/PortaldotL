import { decodeEventLog, type Address, type Hash, type Hex, type Log, type PublicClient } from "viem";
import { blindBidMarketAbi } from "./abi";
import { BLINDBID_ADDRESS, BLINDBID_DEPLOY_BLOCK, NFT_AUCTION_ADDRESS, NFT_AUCTION_DEPLOY_BLOCK } from "./env";
import { fetchRawLogs, type MarketEvent } from "./market-logs";
import { readTender, readTenderCount, type TenderCore } from "./market-storage";
import { sealedNftAuctionAbi } from "./nft-abi";
import type { NftAuctionEvent } from "./nft-logs";
import { readAuction, readAuctionCount, type AuctionCore } from "./nft-storage";

/*
 * One snapshot of everything public about Plinths markets, for Analytics and Reputation: every tender and NFT
 * auction (storage) and every event (one eth_getLogs per contract). PortaldotV3's RPC only serves block data for
 * recent blocks, so event times are estimated from block numbers with the chain's measured block time.
 */

export type ChainEvent = (
  | ({ source: "tender" } & MarketEvent)
  | ({ source: "nft" } & NftAuctionEvent)
) & { blockNumber: bigint; txHash: Hash; logIndex: number; time: number };

export type TenderSnapshot = { id: bigint; core: TenderCore; budgetMin: bigint; budgetMax: bigint; metadata?: Hex };
export type AuctionSnapshot = { id: bigint; core: AuctionCore };

export type MarketSnapshot = {
  tenders: TenderSnapshot[];
  auctions: AuctionSnapshot[];
  events: ChainEvent[];
  head: { number: bigint; timestamp: number };
  /** measured seconds per block, used to estimate event times */
  blockTime: number;
  /** gas paid per transaction, for the transactions whose receipts the RPC still serves */
  gas: Map<Hash, { gasUsed: bigint; fee: bigint; status: "success" | "reverted" }>;
};

const SAMPLE_BLOCKS = 200n;
const RECENT_RECEIPTS = 250n;

function decodeAll(logs: Log[], abi: typeof blindBidMarketAbi | typeof sealedNftAuctionAbi, source: "tender" | "nft") {
  const out: Omit<ChainEvent, "time">[] = [];
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      out.push({
        source,
        name: d.eventName,
        ...(d.args as object),
        blockNumber: log.blockNumber ?? 0n,
        txHash: (log.transactionHash ?? "0x") as Hash,
        logIndex: log.logIndex ?? 0,
      } as Omit<ChainEvent, "time">);
    } catch {
      // not one of ours
    }
  }
  return out;
}

async function measureBlockTime(client: PublicClient, head: { number: bigint; timestamp: bigint }): Promise<number> {
  if (head.number <= SAMPLE_BLOCKS) return 6;
  const past = await client.getBlock({ blockNumber: head.number - SAMPLE_BLOCKS }).catch(() => undefined);
  if (!past) return 6;
  const t = Number(head.timestamp - past.timestamp) / Number(SAMPLE_BLOCKS);
  return t > 0 && t < 120 ? t : 6;
}

export async function loadMarketSnapshot(client: PublicClient): Promise<MarketSnapshot> {
  const head = await client.getBlock({ blockTag: "latest" });
  const [blockTime, tenderPart, auctionPart] = await Promise.all([
    measureBlockTime(client, head),
    (async () => {
      if (!BLINDBID_ADDRESS) return { tenders: [] as TenderSnapshot[], events: [] as Omit<ChainEvent, "time">[] };
      const [count, logs] = await Promise.all([readTenderCount(client, BLINDBID_ADDRESS), fetchRawLogs(client, BLINDBID_ADDRESS, BLINDBID_DEPLOY_BLOCK, [])]);
      const events = decodeAll(logs, blindBidMarketAbi, "tender");
      const cores = await Promise.all(Array.from({ length: Number(count) }, (_, i) => readTender(client, BLINDBID_ADDRESS!, BigInt(i))));
      const tenders = cores.map((core, i) => {
        const created = events.find((e) => e.name === "TenderCreated" && (e as { tenderId?: bigint }).tenderId === BigInt(i)) as
          | Extract<MarketEvent, { name: "TenderCreated" }>
          | undefined;
        return { id: BigInt(i), core, budgetMin: created?.budgetMin ?? 0n, budgetMax: created?.budgetMax ?? 0n, metadata: created?.metadata };
      });
      return { tenders, events };
    })(),
    (async () => {
      if (!NFT_AUCTION_ADDRESS) return { auctions: [] as AuctionSnapshot[], events: [] as Omit<ChainEvent, "time">[] };
      const [count, logs] = await Promise.all([readAuctionCount(client, NFT_AUCTION_ADDRESS), fetchRawLogs(client, NFT_AUCTION_ADDRESS, NFT_AUCTION_DEPLOY_BLOCK, [])]);
      const cores = await Promise.all(Array.from({ length: Number(count) }, (_, i) => readAuction(client, NFT_AUCTION_ADDRESS!, BigInt(i))));
      return { auctions: cores.map((core, i) => ({ id: BigInt(i), core })), events: decodeAll(logs, sealedNftAuctionAbi, "nft") };
    })(),
  ]);

  const headTs = Number(head.timestamp);
  const estimate = (n: bigint) => Math.round(headTs - Number(head.number - n) * blockTime);
  const events = [...tenderPart.events, ...auctionPart.events]
    .map((e) => ({ ...e, time: estimate(e.blockNumber) }) as ChainEvent)
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));

  // Gas: receipts are only served for recent blocks.
  const recent = [...new Set(events.filter((e) => e.blockNumber + RECENT_RECEIPTS >= head.number).map((e) => e.txHash))];
  const gas = new Map<Hash, { gasUsed: bigint; fee: bigint; status: "success" | "reverted" }>();
  await Promise.all(
    recent.map(async (h) => {
      const r = await client.getTransactionReceipt({ hash: h }).catch(() => undefined);
      if (r) gas.set(h, { gasUsed: r.gasUsed, fee: r.gasUsed * r.effectiveGasPrice, status: r.status });
    }),
  );

  return { tenders: tenderPart.tenders, auctions: auctionPart.auctions, events, head: { number: head.number, timestamp: headTs }, blockTime, gas };
}

/** Every wallet an event names (bidder, buyer, seller, winner, account). */
export function actorsOf(e: ChainEvent): Address[] {
  const a = e as unknown as Record<string, unknown>;
  return (["buyer", "bidder", "seller", "winner", "account"] as const).flatMap((k) => (typeof a[k] === "string" && /^0x[0-9a-fA-F]{40}$/.test(a[k] as string) ? [a[k] as Address] : []));
}

