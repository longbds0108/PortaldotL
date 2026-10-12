"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  LimitExceededRpcError,
  UserRejectedRequestError,
  parseGwei,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import {
  ERROR_TEXT,
  blindBidAddress,
  blindBidMarketAbi,
  type Bid,
  TenderState,
  type Tender,
} from "./contracts";
import { fetchJson } from "./ipfs";
import { tenderMetadataSchema, type TenderMetadata } from "./metadata";

/** Background refresh of on-chain reads. Kept moderate: public Arc RPCs rate-limit aggressive polling. */
const REFRESH_MS = 15_000;

// ───────────────────────── chain time ─────────────────────────

/**
 * Current chain time in seconds, derived from the latest block timestamp and ticked locally.
 * Countdowns use this — never the user's wall clock — because the contract decides with block.timestamp.
 */
export function useChainNow(): number | undefined {
  const client = usePublicClient();
  const { data: offset } = useQuery({
    queryKey: ["chain-time-offset"],
    queryFn: async () => {
      const block = await client!.getBlock({ blockTag: "latest" });
      return Number(block.timestamp) - Date.now() / 1000;
    },
    enabled: !!client,
    refetchInterval: 30_000,
  });
  const [nowMs, setNowMs] = useState<number>();
  useEffect(() => {
    setNowMs(Date.now());
    const i = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (offset === undefined || nowMs === undefined) return undefined;
  return Math.floor(nowMs / 1000 + offset);
}

// ───────────────────────── tenders ─────────────────────────

export type TenderRow = { id: bigint; tender: Tender; state: TenderState };

const enabled = !!blindBidAddress;
const base = { address: blindBidAddress!, abi: blindBidMarketAbi } as const;

export function useTender(id: bigint | undefined) {
  const res = useReadContracts({
    contracts:
      id === undefined
        ? []
        : [
            { ...base, functionName: "getTender", args: [id] },
            { ...base, functionName: "getTenderState", args: [id] },
          ],
    query: { enabled: enabled && id !== undefined, refetchInterval: REFRESH_MS },
  });
  const [t, s] = res.data ?? [];
  const row: TenderRow | undefined =
    id !== undefined && t?.status === "success" && s?.status === "success"
      ? { id, tender: t.result as Tender, state: s.result as TenderState }
      : undefined;
  const notFound = t?.status === "failure";
  return { ...res, row, notFound };
}

/** Loads tenders by id (all tenders when `ids` is undefined), newest first. */
export function useTenders(ids?: readonly bigint[]) {
  const count = useReadContract({
    ...base,
    functionName: "tenderCount",
    query: { enabled: enabled && ids === undefined, refetchInterval: REFRESH_MS },
  });
  const list =
    ids ??
    (count.data !== undefined ? Array.from({ length: Number(count.data) }, (_, i) => BigInt(i)) : undefined);
  const ordered = list ? [...list].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)) : [];

  const res = useReadContracts({
    contracts: ordered.flatMap((id) => [
      { ...base, functionName: "getTender", args: [id] } as const,
      { ...base, functionName: "getTenderState", args: [id] } as const,
    ]),
    query: { enabled: enabled && ordered.length > 0, refetchInterval: REFRESH_MS },
  });

  const rows: TenderRow[] = [];
  ordered.forEach((id, i) => {
    const t = res.data?.[2 * i];
    const s = res.data?.[2 * i + 1];
    if (t?.status === "success" && s?.status === "success") {
      rows.push({ id, tender: t.result as Tender, state: s.result as TenderState });
    }
  });
  const isLoading = (ids === undefined && count.isLoading) || res.isLoading;
  return { rows, isLoading, error: count.error ?? res.error, refetch: res.refetch };
}

export function useMyTenderIds() {
  const { address } = useAccount();
  return useReadContract({
    ...base,
    functionName: "getBuyerTenders",
    args: [address!],
    query: { enabled: enabled && !!address, refetchInterval: REFRESH_MS },
  });
}

export function useMyBidTenderIds() {
  const { address } = useAccount();
  return useReadContract({
    ...base,
    functionName: "getBidderTenders",
    args: [address!],
    query: { enabled: enabled && !!address, refetchInterval: REFRESH_MS },
  });
}

export function useTenderMetadata(uri: string | undefined) {
  return useQuery({
    queryKey: ["tender-metadata", uri],
    queryFn: async (): Promise<TenderMetadata> => tenderMetadataSchema.parse(await fetchJson(uri!)),
    enabled: !!uri,
    staleTime: Infinity,
    retry: 1,
  });
}

// ───────────────────────── bids ─────────────────────────

export type BidRow = { bidder: Address; bid: Bid };

export function useBids(tenderId: bigint | undefined) {
  const bidders = useReadContract({
    ...base,
    functionName: "getBidders",
    args: [tenderId!],
    query: { enabled: enabled && tenderId !== undefined, refetchInterval: REFRESH_MS },
  });
  const addrs = (bidders.data ?? []) as readonly Address[];
  const bids = useReadContracts({
    contracts: addrs.map((a) => ({ ...base, functionName: "getBid", args: [tenderId!, a] }) as const),
    query: { enabled: enabled && addrs.length > 0, refetchInterval: REFRESH_MS },
  });
  const rows: BidRow[] = [];
  addrs.forEach((bidder, i) => {
    const r = bids.data?.[i];
    if (r?.status === "success") rows.push({ bidder, bid: r.result as Bid });
  });
  return {
    rows,
    isLoading: bidders.isLoading || bids.isLoading,
    refetch: async () => {
      await bidders.refetch();
      await bids.refetch();
    },
  };
}

export function useMyBid(tenderId: bigint | undefined) {
  const { address } = useAccount();
  return useReadContract({
    ...base,
    functionName: "getBid",
    args: [tenderId!, address!],
    query: { enabled: enabled && tenderId !== undefined && !!address, refetchInterval: REFRESH_MS },
  });
}

/**
 * Native USDC still locked in this wallet's bid bonds: bonds not withdrawn and not forfeited
 * (a bond is forfeited once the reveal window closed without a reveal).
 */
export function useMyLockedBonds(rows: TenderRow[]) {
  const { address } = useAccount();
  const res = useReadContracts({
    contracts: rows.map((r) => ({ ...base, functionName: "getBid", args: [r.id, address!] }) as const),
    query: { enabled: enabled && !!address && rows.length > 0, refetchInterval: REFRESH_MS },
  });
  let lockedWei = 0n;
  let count = 0;
  rows.forEach((r, i) => {
    const out = res.data?.[i];
    if (out?.status !== "success") return;
    const bid = out.result as Bid;
    const revealClosed = r.state !== TenderState.Open && r.state !== TenderState.Reveal;
    const forfeited = revealClosed && !bid.revealed;
    if (bid.bond > 0n && !bid.bondWithdrawn && !forfeited) {
      lockedWei += bid.bond;
      count += 1;
    }
  });
  return { lockedWei, count, isLoading: res.isLoading };
}

// ───────────────────────── writes ─────────────────────────

type Abi = typeof blindBidMarketAbi;
type WriteFn = ContractFunctionName<Abi, "nonpayable" | "payable">;

export type TxStatus = "idle" | "simulating" | "signing" | "confirming" | "success" | "error";

/** Arc mempool silently drops txs below 20 gwei maxFeePerGas (docs: EVM differences). */
const ARC_MIN_FEE = parseGwei("20");

export function useBlindBidTx() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const send = useCallback(
    async <F extends WriteFn>(
      functionName: F,
      args: ContractFunctionArgs<Abi, "nonpayable" | "payable", F>,
      value?: bigint,
    ): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      try {
        if (!client || !address || !blindBidAddress) throw new Error("Connect your wallet first.");
        setStatus("simulating");
        // Simulate first: decodes custom errors and avoids paying gas for a revert (e.g. blocklisted address).
        const { request } = await client.simulateContract({
          address: blindBidAddress,
          abi: blindBidMarketAbi,
          functionName,
          args,
          value,
          account: address,
        } as never);
        const fees = await client.estimateFeesPerGas();
        const maxFeePerGas = fees.maxFeePerGas > ARC_MIN_FEE ? fees.maxFeePerGas : ARC_MIN_FEE;
        const maxPriorityFeePerGas =
          fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : maxFeePerGas;

        setStatus("signing");
        const txHash = await writeContractAsync({
          ...(request as object),
          maxFeePerGas,
          maxPriorityFeePerGas,
        } as never);
        setHash(txHash);
        setStatus("confirming");
        // Arc finality is deterministic and sub-second: one receipt is final.
        const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
        if (receipt.status !== "success") throw new Error("Transaction reverted.");
        setStatus("success");
        return receipt;
      } catch (e) {
        setStatus("error");
        setError(describeError(e));
        return undefined;
      }
    },
    [client, address, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  const busy = status === "simulating" || status === "signing" || status === "confirming";
  return { send, status, hash, error, busy, reset };
}

export function describeError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "Request rejected in wallet.";
    if (
      e.walk((x) => x instanceof LimitExceededRpcError || (x instanceof HttpRequestError && x.status === 429))
    ) {
      return "The Arc RPC is rate-limiting requests right now. Wait a few seconds and try again.";
    }
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
      if (name) return name;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
