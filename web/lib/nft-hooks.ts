"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { NFT_AUCTION_DEPLOY_BLOCK } from "./env";
import { RECEIPT_TIMEOUT_MS, TX_FALLBACK_LABEL, describeError, txToaster, useChainNow, type TxStatus } from "./hooks";
import { tr, type Text } from "./i18n";
import {
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC721_INTERFACE_ID,
  NFT_ERROR_TEXT,
  erc721Abi,
  nftAuctionAddress,
  sealedNftAuctionAbi,
  type AuctionBid,
  type AuctionRow,
} from "./nft-auction";
import { fetchAuctionLogs, fetchBidderAuctionIds, fetchSellerAuctionIds, type NftAuctionLog } from "./nft-logs";
import { fetchNftMetadata, type NftMetadata } from "./nft-metadata";
import { auctionState, readAuction, readAuctionBid, readAuctionCount, withdrawableAmount, type AuctionCore } from "./nft-storage";
import { blockTimestamps } from "./timeline";
import { buildPreviewAuctions, previewTokenURI, PREVIEW_COLLECTION } from "./nft-preview";

/** Same cadence as the tender reads: public PortaldotV3 RPCs rate-limit aggressive polling. */
const REFRESH_MS = 15_000;
const ZERO_HASH = `0x${"0".repeat(64)}` as const;

export const nftAuctionEnabled = !!nftAuctionAddress;

/** Stable preview data for the lifetime of the component (device clock, illustrative values). */
function usePreview() {
  const [preview] = useState(() => (nftAuctionEnabled ? [] : buildPreviewAuctions()));
  return preview;
}

/*
 * SealedNFTAuction has no views: auctions and bids are read from packed storage (nft-storage.ts), and bidder
 * lists, salts and placement times from events (nft-logs.ts). The phase is derived here from chain time.
 */

function toRow(id: bigint, core: AuctionCore, nowSec: number | undefined): AuctionRow | undefined {
  if (nowSec === undefined) return undefined;
  return { id, auction: core, state: auctionState(core, nowSec) };
}

/** Loads auctions by id (all when `ids` is undefined), newest first. */
export function useAuctions(ids?: readonly bigint[]) {
  const preview = usePreview();
  const client = usePublicClient();
  const now = useChainNow();
  const q = useQuery({
    queryKey: ["nft-auctions", ids?.map(String) ?? "all"],
    queryFn: async () => {
      const list = ids ?? Array.from({ length: Number(await readAuctionCount(client!, nftAuctionAddress!)) }, (_, i) => BigInt(i));
      const ordered = [...list].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
      return Promise.all(ordered.map(async (id) => ({ id, core: await readAuction(client!, nftAuctionAddress!, id) })));
    },
    enabled: nftAuctionEnabled && !!client,
    refetchInterval: REFRESH_MS,
  });
  if (!nftAuctionEnabled) {
    const rows = preview.map((p) => p.row).filter((r) => !ids || ids.includes(r.id));
    return { rows, isLoading: false, error: null, refetch: () => undefined };
  }
  const rows = (q.data ?? []).flatMap((x) => toRow(x.id, x.core, now) ?? []);
  return { rows, isLoading: q.isLoading || (!!q.data && now === undefined), error: q.error, refetch: () => void q.refetch() };
}

export function useAuction(id: bigint | undefined) {
  const preview = usePreview();
  const client = usePublicClient();
  const now = useChainNow();
  const q = useQuery({
    queryKey: ["nft-auction", id?.toString()],
    queryFn: async () => {
      const count = await readAuctionCount(client!, nftAuctionAddress!);
      if (id! >= count) return null;
      return readAuction(client!, nftAuctionAddress!, id!);
    },
    enabled: nftAuctionEnabled && !!client && id !== undefined,
    refetchInterval: REFRESH_MS,
  });
  if (!nftAuctionEnabled) {
    const row = preview.find((p) => p.row.id === id)?.row;
    return { row, notFound: id !== undefined && !row, isLoading: false, refetch: () => undefined };
  }
  const row = q.data && id !== undefined ? toRow(id, q.data, now) : undefined;
  return { row, notFound: q.data === null, isLoading: q.isLoading || (!!q.data && !row), refetch: () => void q.refetch() };
}

export type AuctionBidRow = { bidder: Address; bid: AuctionBid };

/** Every bid on one auction: bidders from BidPlaced events, current values from storage. */
export function useAuctionBids(id: bigint | undefined) {
  const preview = usePreview();
  const client = usePublicClient();
  const q = useQuery({
    queryKey: ["nft-auction-bids", id?.toString()],
    queryFn: async (): Promise<AuctionBidRow[]> => {
      const core = await readAuction(client!, nftAuctionAddress!, id!);
      const logs = await fetchAuctionLogs(client!, nftAuctionAddress!, id!, core.createdBlock || NFT_AUCTION_DEPLOY_BLOCK);
      const placed = new Map<string, NftAuctionLog>();
      const salts = new Map<string, Hex>();
      for (const l of logs) {
        if (l.name === "BidPlaced") placed.set(l.bidder.toLowerCase(), l); // last placement wins
        if (l.name === "BidRevealed") salts.set(l.bidder.toLowerCase(), l.salt);
      }
      const times = await blockTimestamps(client!, [...placed.values()].map((l) => l.blockNumber));
      return Promise.all(
        [...placed.values()].map(async (l) => {
          const bidder = (l as Extract<NftAuctionLog, { name: "BidPlaced" }>).bidder;
          const b = await readAuctionBid(client!, nftAuctionAddress!, id!, bidder);
          return {
            bidder,
            bid: { ...b, committedBlock: l.blockNumber, committedAt: times.get(l.blockNumber) ?? 0n, salt: salts.get(bidder.toLowerCase()) ?? ZERO_HASH },
          };
        }),
      );
    },
    enabled: nftAuctionEnabled && !!client && id !== undefined,
    refetchInterval: REFRESH_MS,
  });
  if (!nftAuctionEnabled) return { rows: preview.find((p) => p.row.id === id)?.bids ?? [], isLoading: false };
  return { rows: q.data ?? [], isLoading: q.isLoading };
}

/** The connected wallet's bid on one auction (storage only; undefined while loading or without a wallet). */
export function useMyAuctionBid(id: bigint | undefined) {
  const { address } = useAccount();
  const client = usePublicClient();
  return useQuery({
    queryKey: ["nft-my-bid", id?.toString(), address],
    queryFn: async (): Promise<AuctionBid> => {
      const b = await readAuctionBid(client!, nftAuctionAddress!, id!, address!);
      return { ...b, committedAt: 0n, committedBlock: 0n, salt: ZERO_HASH };
    },
    enabled: nftAuctionEnabled && !!client && id !== undefined && !!address,
    refetchInterval: REFRESH_MS,
  });
}

/** What withdraw(id) would pay the connected wallet now — computed with the contract's own rules. */
export function useWithdrawable(id: bigint | undefined) {
  const { address } = useAccount();
  const client = usePublicClient();
  const now = useChainNow();
  const q = useQuery({
    queryKey: ["nft-withdrawable", id?.toString(), address],
    queryFn: async () => {
      const [core, bid] = await Promise.all([
        readAuction(client!, nftAuctionAddress!, id!),
        readAuctionBid(client!, nftAuctionAddress!, id!, address!),
      ]);
      return { core, bid };
    },
    enabled: nftAuctionEnabled && !!client && id !== undefined && !!address,
    refetchInterval: REFRESH_MS,
  });
  const data = q.data && address && now !== undefined ? withdrawableAmount(q.data.core, q.data.bid, address, now) : undefined;
  return { data, refetch: q.refetch };
}

/** Auction ids the connected wallet listed (as seller) or bid on. */
export function useMyAuctionIds() {
  const { address } = useAccount();
  const client = usePublicClient();
  return useQuery({
    queryKey: ["nft-my-auction-ids", address],
    queryFn: async () => {
      const [selling, bidding] = await Promise.all([
        fetchSellerAuctionIds(client!, nftAuctionAddress!, NFT_AUCTION_DEPLOY_BLOCK, address!),
        fetchBidderAuctionIds(client!, nftAuctionAddress!, NFT_AUCTION_DEPLOY_BLOCK, address!),
      ]);
      return { selling, bidding };
    },
    enabled: nftAuctionEnabled && !!client && !!address,
    refetchInterval: REFRESH_MS,
  });
}

// ───────────────────────── NFTs (any ERC-721 on PortaldotV3) ─────────────────────────

export function useNftMetadata(tokenURI: string | undefined) {
  return useQuery({
    queryKey: ["nft-metadata", tokenURI],
    queryFn: async (): Promise<NftMetadata> => fetchNftMetadata(tokenURI!),
    enabled: !!tokenURI,
    staleTime: Infinity,
    retry: 1,
  });
}

export type NftToken = {
  owner?: Address;
  tokenURI?: string;
  collectionName?: string;
  symbol?: string;
  isErc721?: boolean;
  enumerable?: boolean;
  /** ownerOf reverted: the token does not exist (or the address is not an ERC-721). */
  missing: boolean;
};

/** Reads one token straight from its collection. Works without the auction contract. */
export function useNftToken(collection: Address | undefined, tokenId: bigint | undefined) {
  const isPreview = collection === PREVIEW_COLLECTION;
  const c = { address: collection!, abi: erc721Abi } as const;
  const res = useReadContracts({
    contracts:
      collection && tokenId !== undefined && !isPreview
        ? [
            { ...c, functionName: "ownerOf", args: [tokenId] },
            { ...c, functionName: "tokenURI", args: [tokenId] },
            { ...c, functionName: "name" },
            { ...c, functionName: "symbol" },
            { ...c, functionName: "supportsInterface", args: [ERC721_INTERFACE_ID] },
            { ...c, functionName: "supportsInterface", args: [ERC721_ENUMERABLE_INTERFACE_ID] },
          ]
        : [],
    query: { enabled: !!collection && tokenId !== undefined && !isPreview },
  });
  if (isPreview && tokenId !== undefined) {
    const token: NftToken = {
      tokenURI: previewTokenURI(tokenId),
      collectionName: "Plinths Test NFT",
      symbol: "PTNFT",
      isErc721: true,
      enumerable: true,
      missing: !previewTokenURI(tokenId),
    };
    return { token, isLoading: false };
  }
  const d = res.data;
  const ok = <T,>(i: number) => (d?.[i]?.status === "success" ? (d[i].result as T) : undefined);
  const token: NftToken = {
    owner: ok<Address>(0),
    tokenURI: ok<string>(1),
    collectionName: ok<string>(2),
    symbol: ok<string>(3),
    isErc721: ok<boolean>(4),
    enumerable: ok<boolean>(5),
    missing: d?.[0]?.status === "failure",
  };
  return { token, isLoading: res.isLoading };
}

/** tokenURI for each auctioned NFT (index-aligned with `rows`), e.g. to search by name. */
export function useAuctionTokenURIs(rows: AuctionRow[]): (string | undefined)[] {
  const res = useReadContracts({
    contracts: rows.map((r) => ({ address: r.auction.collection, abi: erc721Abi, functionName: "tokenURI", args: [r.auction.tokenId] }) as const),
    query: { enabled: nftAuctionEnabled && rows.length > 0, staleTime: Infinity },
  });
  if (!nftAuctionEnabled) return rows.map((r) => previewTokenURI(r.auction.tokenId));
  return rows.map((_, i) => (res.data?.[i]?.status === "success" ? (res.data[i].result as string) : undefined));
}

const MAX_LISTED = 24;

/** Tokens a wallet holds in an ERC721Enumerable collection (first 24). */
export function useOwnedTokens(collection: Address | undefined, owner: Address | undefined, enumerable: boolean | undefined) {
  const c = { address: collection!, abi: erc721Abi } as const;
  const on = !!collection && !!owner && !!enumerable;
  const balance = useReadContract({ ...c, functionName: "balanceOf", args: [owner!], query: { enabled: on } });
  const n = Math.min(Number(balance.data ?? 0n), MAX_LISTED);
  const ids = useReadContracts({
    contracts: Array.from({ length: on ? n : 0 }, (_, i) => ({ ...c, functionName: "tokenOfOwnerByIndex", args: [owner!, BigInt(i)] }) as const),
    query: { enabled: on && n > 0 },
  });
  const tokenIds = (ids.data ?? []).flatMap((r) => (r.status === "success" ? [r.result as bigint] : []));
  return { tokenIds, total: balance.data, isLoading: balance.isLoading || ids.isLoading };
}

// ───────────────────────── writes ─────────────────────────

export function describeNftError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && NFT_ERROR_TEXT[name]) return tr(NFT_ERROR_TEXT[name]);
  }
  return describeError(e);
}

const NFT_TX_LABEL: Record<string, Text> = {
  safeTransferFrom: ["List NFT", "Đăng bán NFT"],
  placeBid: ["Sealed bid", "Gửi giá niêm phong"],
  revealBid: ["Reveal bid", "Công bố giá"],
  settle: ["Settle auction", "Kết thúc đấu giá"], // also the seller's cancel while Open with no bids
  withdraw: ["Withdraw", "Rút tiền"],
};

type WriteRequest = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint };

/** Simulate → sign → wait, like useBlindBidTx, for the auction contract and ERC-721 listing transfers. */
export function useNftTx() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const run = useCallback(
    async (req: WriteRequest): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      const t = txToaster(NFT_TX_LABEL[req.functionName] ?? TX_FALLBACK_LABEL);
      try {
        if (!client || !address) throw new Error(tr("Connect your wallet first.", "Hãy kết nối ví trước."));
        setStatus("simulating");
        const { request } = await client.simulateContract({ ...req, account: address } as never);
        setStatus("signing");
        t.signing();
        const txHash = await writeContractAsync({ ...(request as object) } as never);
        setHash(txHash);
        setStatus("confirming");
        t.confirming();
        const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: RECEIPT_TIMEOUT_MS });
        if (receipt.status !== "success") throw new Error(tr("Transaction reverted.", "Giao dịch bị hoàn tác (revert)."));
        setStatus("success");
        t.success();
        return receipt;
      } catch (e) {
        const message = describeNftError(e);
        setStatus("error");
        setError(message);
        t.error(message);
        return undefined;
      }
    },
    [client, address, writeContractAsync],
  );

  /** Call a function on the auction contract. */
  const send = useCallback(
    (functionName: string, args: readonly unknown[], value?: bigint) =>
      run({ address: nftAuctionAddress!, abi: sealedNftAuctionAbi as Abi, functionName, args, value }),
    [run],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  const busy = status === "simulating" || status === "signing" || status === "confirming";
  return { run, send, status, hash, error, busy, reset };
}

/** Auction id created by a listing transfer (AuctionCreated emitted from onERC721Received). */
export function createdAuctionId(receipt: TransactionReceipt): bigint | undefined {
  const logs = parseEventLogs({ abi: sealedNftAuctionAbi, logs: receipt.logs, eventName: "AuctionCreated" });
  return logs.find((l) => l.address.toLowerCase() === nftAuctionAddress?.toLowerCase())?.args.auctionId;
}
