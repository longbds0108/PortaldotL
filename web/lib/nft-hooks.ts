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
  type TransactionReceipt,
} from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { RECEIPT_TIMEOUT_MS, describeError, txToaster, type TxStatus } from "./hooks";
import {
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC721_INTERFACE_ID,
  NFT_ERROR_TEXT,
  erc721Abi,
  nftAuctionAddress,
  sealedNftAuctionAbi,
  type Auction,
  type AuctionBid,
  type AuctionRow,
  type AuctionState,
} from "./nft-auction";
import { fetchNftMetadata, type NftMetadata } from "./nft-metadata";
import { buildPreviewAuctions, previewTokenURI, PREVIEW_COLLECTION } from "./nft-preview";

/** Same cadence as the tender reads: public PortaldotV3 RPCs rate-limit aggressive polling. */
const REFRESH_MS = 15_000;

export const nftAuctionEnabled = !!nftAuctionAddress;
const base = { address: nftAuctionAddress!, abi: sealedNftAuctionAbi } as const;

/** Stable preview data for the lifetime of the component (device clock, illustrative values). */
function usePreview() {
  const [preview] = useState(() => (nftAuctionEnabled ? [] : buildPreviewAuctions()));
  return preview;
}

// ───────────────────────── auctions ─────────────────────────

/** Loads auctions by id (all when `ids` is undefined), newest first. */
export function useAuctions(ids?: readonly bigint[]) {
  const preview = usePreview();
  const count = useReadContract({
    ...base,
    functionName: "auctionCount",
    query: { enabled: nftAuctionEnabled && ids === undefined, refetchInterval: REFRESH_MS },
  });
  const list =
    ids ?? (count.data !== undefined ? Array.from({ length: Number(count.data) }, (_, i) => BigInt(i)) : undefined);
  const ordered = list ? [...list].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)) : [];
  const res = useReadContracts({
    contracts: ordered.flatMap((id) => [
      { ...base, functionName: "getAuction", args: [id] } as const,
      { ...base, functionName: "getAuctionState", args: [id] } as const,
    ]),
    query: { enabled: nftAuctionEnabled && ordered.length > 0, refetchInterval: REFRESH_MS },
  });

  if (!nftAuctionEnabled) {
    const rows = preview.map((p) => p.row).filter((r) => !ids || ids.includes(r.id));
    return { rows, isLoading: false, error: null, refetch: () => undefined };
  }
  const rows: AuctionRow[] = [];
  ordered.forEach((id, i) => {
    const a = res.data?.[2 * i];
    const s = res.data?.[2 * i + 1];
    if (a?.status === "success" && s?.status === "success") {
      rows.push({ id, auction: a.result as Auction, state: s.result as AuctionState });
    }
  });
  const isLoading = (ids === undefined && count.isLoading) || res.isLoading;
  return { rows, isLoading, error: count.error ?? res.error, refetch: () => void res.refetch() };
}

export function useAuction(id: bigint | undefined) {
  const preview = usePreview();
  const res = useReadContracts({
    contracts:
      id === undefined
        ? []
        : [
            { ...base, functionName: "getAuction", args: [id] },
            { ...base, functionName: "getAuctionState", args: [id] },
          ],
    query: { enabled: nftAuctionEnabled && id !== undefined, refetchInterval: REFRESH_MS },
  });
  if (!nftAuctionEnabled) {
    const row = preview.find((p) => p.row.id === id)?.row;
    return { row, notFound: id !== undefined && !row, isLoading: false, refetch: () => undefined };
  }
  const [a, s] = res.data ?? [];
  const row: AuctionRow | undefined =
    id !== undefined && a?.status === "success" && s?.status === "success"
      ? { id, auction: a.result as Auction, state: s.result as AuctionState }
      : undefined;
  return { row, notFound: a?.status === "failure", isLoading: res.isLoading, refetch: () => void res.refetch() };
}

export type AuctionBidRow = { bidder: Address; bid: AuctionBid };

export function useAuctionBids(id: bigint | undefined) {
  const preview = usePreview();
  const bidders = useReadContract({
    ...base,
    functionName: "getBidders",
    args: [id!],
    query: { enabled: nftAuctionEnabled && id !== undefined, refetchInterval: REFRESH_MS },
  });
  const addrs = (bidders.data ?? []) as readonly Address[];
  const bids = useReadContracts({
    contracts: addrs.map((a) => ({ ...base, functionName: "getBid", args: [id!, a] }) as const),
    query: { enabled: nftAuctionEnabled && addrs.length > 0, refetchInterval: REFRESH_MS },
  });
  if (!nftAuctionEnabled) return { rows: preview.find((p) => p.row.id === id)?.bids ?? [], isLoading: false };
  const rows: AuctionBidRow[] = [];
  addrs.forEach((bidder, i) => {
    const r = bids.data?.[i];
    if (r?.status === "success") rows.push({ bidder, bid: r.result as AuctionBid });
  });
  return { rows, isLoading: bidders.isLoading || bids.isLoading };
}

export function useMyAuctionBid(id: bigint | undefined) {
  const { address } = useAccount();
  return useReadContract({
    ...base,
    functionName: "getBid",
    args: [id!, address!],
    query: { enabled: nftAuctionEnabled && id !== undefined && !!address, refetchInterval: REFRESH_MS },
  });
}

export function useWithdrawable(id: bigint | undefined) {
  const { address } = useAccount();
  return useReadContract({
    ...base,
    functionName: "withdrawable",
    args: [id!, address!],
    query: { enabled: nftAuctionEnabled && id !== undefined && !!address, refetchInterval: REFRESH_MS },
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
    if (name && NFT_ERROR_TEXT[name]) return NFT_ERROR_TEXT[name];
  }
  return describeError(e);
}

const NFT_TX_LABEL: Record<string, string> = {
  safeTransferFrom: "List NFT",
  placeBid: "Sealed bid",
  updateBid: "Update bid",
  revealBid: "Reveal bid",
  settle: "Settle auction",
  withdraw: "Withdraw",
  cancel: "Cancel auction",
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
      const t = txToaster(NFT_TX_LABEL[req.functionName] ?? "Transaction");
      try {
        if (!client || !address) throw new Error("Connect your wallet first.");
        setStatus("simulating");
        const { request } = await client.simulateContract({ ...req, account: address } as never);
        setStatus("signing");
        t.signing();
        const txHash = await writeContractAsync({ ...(request as object) } as never);
        setHash(txHash);
        setStatus("confirming");
        t.confirming();
        const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: RECEIPT_TIMEOUT_MS });
        if (receipt.status !== "success") throw new Error("Transaction reverted.");
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
