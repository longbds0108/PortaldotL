import type { Address, PublicClient } from "viem";
import { blindBidAddress } from "./contracts";
import { digestToUri } from "./cid";
import type { AuctionData, TenderData } from "./dispute-engine";
import { TargetKind, type TargetEvent } from "./disputes";
import { NFT_AUCTION_DEPLOY_BLOCK } from "./env";
import { fetchTenderLogs } from "./market-logs";
import { readBid, readTender, readTenderCount } from "./market-storage";
import { erc721Abi, nftAuctionAddress } from "./nft-auction";
import { fetchAuctionLogs } from "./nft-logs";
import { readAuction, readAuctionBid, readAuctionCount } from "./nft-storage";
import { blockTimestamps } from "./timeline";

/* Server- and client-safe loader for the tender or auction a dispute is about (used by the UI and the Dispute Assistant). */

export type TargetContext = {
  exists: boolean;
  organizer?: Address; // tender buyer or NFT seller
  bidders: Address[];
  events: TargetEvent[];
  metadataUri?: string; // tender metadata digest URI
  collection?: Address;
  tokenId?: bigint;
  /** raw data for the Verification Engine */
  tender?: TenderData;
  auction?: AuctionData;
  times: Map<bigint, bigint>;
};

const NONE: TargetContext = { exists: false, bidders: [], events: [], times: new Map() };

/** Events, organizer, bidders and storage of a tender or NFT auction, read the way the rest of the app reads them. */
export async function loadTargetContext(client: PublicClient, kind: TargetKind, targetId: bigint): Promise<TargetContext> {
  if (kind === TargetKind.Tender) {
    if (!blindBidAddress || targetId >= (await readTenderCount(client, blindBidAddress))) return NONE;
    const core = await readTender(client, blindBidAddress, targetId);
    const logs = await fetchTenderLogs(client, blindBidAddress, targetId, core.createdBlock);
    const bidders = [...new Set(logs.flatMap((l) => (l.name === "BidSubmitted" ? [l.bidder] : [])))];
    const [bids, times] = await Promise.all([
      Promise.all(bidders.map(async (b) => [b.toLowerCase(), await readBid(client, blindBidAddress!, targetId, b)] as const)),
      blockTimestamps(client, logs.map((l) => l.blockNumber)),
    ]);
    const created = logs.find((l) => l.name === "TenderCreated");
    return {
      exists: true,
      organizer: core.buyer,
      bidders,
      events: logs.map((l) => ({
        name: l.name,
        txHash: l.txHash,
        blockNumber: l.blockNumber,
        actor: "bidder" in l ? l.bidder : "buyer" in l ? l.buyer : "winner" in l ? l.winner : undefined,
      })),
      metadataUri: created && "metadata" in created ? digestToUri(created.metadata) : undefined,
      tender: { core, logs, bids: new Map(bids) },
      times,
    };
  }
  if (!nftAuctionAddress || targetId >= (await readAuctionCount(client, nftAuctionAddress))) return NONE;
  const core = await readAuction(client, nftAuctionAddress, targetId);
  const logs = await fetchAuctionLogs(client, nftAuctionAddress, targetId, core.createdBlock || NFT_AUCTION_DEPLOY_BLOCK);
  const bidders = [...new Set(logs.flatMap((l) => (l.name === "BidPlaced" ? [l.bidder] : [])))];
  const [bids, times, nftOwner] = await Promise.all([
    Promise.all(bidders.map(async (b) => [b.toLowerCase(), await readAuctionBid(client, nftAuctionAddress!, targetId, b)] as const)),
    blockTimestamps(client, logs.map((l) => l.blockNumber)),
    client.readContract({ address: core.collection, abi: erc721Abi, functionName: "ownerOf", args: [core.tokenId] }).catch(() => undefined),
  ]);
  return {
    exists: true,
    organizer: core.seller,
    bidders,
    events: logs.map((l) => ({
      name: l.name,
      txHash: l.txHash,
      blockNumber: l.blockNumber,
      actor: "bidder" in l ? l.bidder : "seller" in l ? l.seller : "account" in l ? l.account : "winner" in l ? l.winner : undefined,
    })),
    collection: core.collection,
    tokenId: core.tokenId,
    auction: { core, logs, bids: new Map(bids), nftOwner: nftOwner as Address | undefined },
    times,
  };
}

