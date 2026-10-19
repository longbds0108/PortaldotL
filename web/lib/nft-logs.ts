import { decodeEventLog, toEventSelector, type Address, type Hash, type Hex, type Log, type PublicClient } from "viem";
import { addressTopic, fetchRawLogs, uintTopic } from "./market-logs";
import { sealedNftAuctionAbi } from "./nft-abi";

/*
 * What SealedNFTAuction only displays lives in its events: bidder lists, deposits per placement, revealed salts,
 * and who listed what. Every event's first indexed topic is the auctionId; seller / bidder / account is the second.
 */

export type NftAuctionEvent =
  | { name: "AuctionCreated"; auctionId: bigint; seller: Address; collection: Address; tokenId: bigint; reservePrice: bigint; bidDeadline: bigint; revealDeadline: bigint }
  | { name: "BidPlaced"; auctionId: bigint; bidder: Address; commitment: Hex; deposit: bigint; first: boolean }
  | { name: "BidRevealed"; auctionId: bigint; bidder: Address; amount: bigint; salt: Hex; counted: boolean }
  | { name: "AuctionSettled"; auctionId: bigint; winner: Address; amount: bigint }
  | { name: "AuctionCancelled"; auctionId: bigint }
  | { name: "Withdrawn"; auctionId: bigint; account: Address; amount: bigint };

export type NftAuctionLog = NftAuctionEvent & { blockNumber: bigint; txHash: Hash; logIndex: number };

const topicOf = (name: string) => {
  const item = sealedNftAuctionAbi.find((x) => x.type === "event" && x.name === name);
  if (!item || item.type !== "event") throw new Error(`Unknown event ${name}`);
  return toEventSelector(item);
};
const AUCTION_CREATED = topicOf("AuctionCreated");
const BID_PLACED = topicOf("BidPlaced");

function decode(logs: Log[]): NftAuctionLog[] {
  const out: NftAuctionLog[] = [];
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi: sealedNftAuctionAbi, data: log.data, topics: log.topics });
      out.push({
        ...({ name: d.eventName, ...(d.args as object) } as NftAuctionEvent),
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

/** All events of one auction, oldest first. `fromBlock` = its createdBlock. */
export async function fetchAuctionLogs(client: PublicClient, address: Address, auctionId: bigint, fromBlock: bigint) {
  return decode(await fetchRawLogs(client, address, fromBlock, [null, uintTopic(auctionId)]));
}

/** Ids of auctions a wallet listed. */
export async function fetchSellerAuctionIds(client: PublicClient, address: Address, fromBlock: bigint, seller: Address) {
  const logs = decode(await fetchRawLogs(client, address, fromBlock, [AUCTION_CREATED, null, addressTopic(seller)]));
  return [...new Set(logs.map((l) => l.auctionId))];
}

/** Ids of auctions a wallet has bid on. */
export async function fetchBidderAuctionIds(client: PublicClient, address: Address, fromBlock: bigint, bidder: Address) {
  const logs = decode(await fetchRawLogs(client, address, fromBlock, [BID_PLACED, null, addressTopic(bidder)]));
  return [...new Set(logs.map((l) => l.auctionId))];
}
