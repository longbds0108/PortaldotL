"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  LimitExceededRpcError,
  ResourceUnavailableRpcError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress,
  zeroHash,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { toast } from "@/components/toaster";
import { digestToUri } from "./cid";
import { ERROR_TEXT, blindBidAddress, blindBidMarketAbi, type Bid, TenderState, type Tender } from "./contracts";
import { BLINDBID_DEPLOY_BLOCK, PORTALDOT_RPC_URL } from "./env";
import { chain } from "./wagmi";
import { fetchJson } from "./ipfs";
import { fetchBidderTenderIds, fetchCreatedLogs, fetchTenderLogs, type MarketLog } from "./market-logs";
import { readBid, readTender, readTenderCount, tenderState, type BidCore, type TenderCore } from "./market-storage";
import { tenderMetadataSchema, type TenderMetadata } from "./metadata";
import { blockTimestamps } from "./timeline";

/*
 * Reads: the market has no view functions (storage deposits on PortaldotV3), so tenders and bids come from
 * contract storage (lib/market-storage.ts) merged with their events (lib/market-logs.ts). State is derived from
 * chain time exactly as the contract does.
 */

/** Background refresh of on-chain reads. Kept moderate: public PortaldotV3 RPCs rate-limit aggressive polling. */
const REFRESH_MS = 15_000;

const enabled = !!blindBidAddress;
const market = blindBidAddress!;

// ───────────────────────── chain time ─────────────────────────

/**
 * Current chain time in seconds, derived from the latest block timestamp and ticked locally.
 * Countdowns use this — never the user's wall clock — because the contract decides with block.timestamp.
 */
export function useChainNow(): number | undefined {
  const head = useChainHead();
  const offset = head.data?.offset;
  const [nowMs, setNowMs] = useState<number>();
  useEffect(() => {
    setNowMs(Date.now());
    const i = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (nowMs === undefined || (enabled && offset === undefined)) return undefined;
  return Math.floor(nowMs / 1000 + (enabled ? offset! : 0));
}

/** Latest block (number, timestamp) and its offset from the device clock. Shared by every countdown. */
export function useChainHead() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["chain-head"],
    queryFn: async () => {
      const block = await client!.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp, offset: Number(block.timestamp) - Date.now() / 1000 };
    },
    enabled: !!client && enabled,
    refetchInterval: 15_000,
  });
}

// ───────────────────────── view models ─────────────────────────

export type TenderRow = { id: bigint; tender: Tender; state: TenderState };
export type BidRow = { bidder: Address; bid: Bid };

function toTender(core: TenderCore, logs: MarketLog[]): Tender {
  const created = logs.find((l) => l.name === "TenderCreated");
  const awarded = logs.find((l) => l.name === "TenderAwarded");
  return {
    ...core,
    awardedBlock: awarded?.blockNumber ?? 0n,
    budgetMin: created?.name === "TenderCreated" ? created.budgetMin : 0n,
    budgetMax: created?.name === "TenderCreated" ? created.budgetMax : 0n,
    metadataURI: created?.name === "TenderCreated" ? digestToUri(created.metadata) : "",
    reasonURI: awarded?.name === "TenderAwarded" ? digestToUri(awarded.reason) : "",
  };
}

function toBid(core: BidCore, logs: MarketLog[], bidder: Address, timestamps: Map<bigint, bigint>): Bid {
  const mine = logs.filter((l) => "bidder" in l && l.bidder.toLowerCase() === bidder.toLowerCase());
  const submitted = mine.filter((l) => l.name === "BidSubmitted").at(-1);
  const revealed = mine.find((l) => l.name === "BidRevealed");
  const committedBlock = submitted?.blockNumber ?? 0n;
  return {
    ...core,
    encryptedDocURI: submitted?.name === "BidSubmitted" ? digestToUri(submitted.encryptedDoc) : "",
    committedBlock,
    committedAt: timestamps.get(committedBlock) ?? 0n,
    revealedBlock: revealed?.blockNumber ?? 0n,
    salt: revealed?.name === "BidRevealed" ? revealed.salt : zeroHash,
    docKey: revealed?.name === "BidRevealed" ? revealed.docKey : zeroHash,
  };
}

const withState = (id: bigint, tender: Tender, now: number | undefined): TenderRow => ({
  id,
  tender,
  state: tenderState(tender, now ?? Math.floor(Date.now() / 1000)),
});

// ───────────────────────── tenders ─────────────────────────

/** Storage + events of one tender (null when the id does not exist). Shared by useTender and useBids. */
function useTenderData(id: bigint | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["tender-data", id?.toString()],
    queryFn: async () => {
      if ((await readTenderCount(client!, market)) <= id!) return null;
      const core = await readTender(client!, market, id!);
      const logs = await fetchTenderLogs(client!, market, id!, core.createdBlock);
      return { core, logs };
    },
    enabled: enabled && !!client && id !== undefined,
    refetchInterval: REFRESH_MS,
  });
}

export function useTender(id: bigint | undefined) {
  const res = useTenderData(id);
  const now = useChainNow();
  const row = id !== undefined && res.data ? withState(id, toTender(res.data.core, res.data.logs), now) : undefined;
  return { row, notFound: res.data === null, isLoading: res.isLoading, refetch: res.refetch };
}

/** Loads tenders by id (all tenders when `ids` is undefined), newest first. */
export function useTenders(ids?: readonly bigint[]) {
  const client = usePublicClient();
  const now = useChainNow();
  const key = ids?.map(String).join(",") ?? "all";
  const res = useQuery({
    queryKey: ["tenders", key],
    queryFn: async () => {
      const count = await readTenderCount(client!, market);
      const list = (ids ?? Array.from({ length: Number(count) }, (_, i) => BigInt(i))).filter((id) => id < count);
      const [cores, created] = await Promise.all([
        Promise.all(list.map((id) => readTender(client!, market, id))),
        fetchCreatedLogs(client!, market, BLINDBID_DEPLOY_BLOCK),
      ]);
      const byId = new Map(created.map((l) => [l.tenderId, l]));
      return list.map((id, i) => ({ id, tender: toTender(cores[i], byId.has(id) ? [byId.get(id)!] : []) }));
    },
    enabled: enabled && !!client && (ids === undefined || ids.length > 0),
    refetchInterval: REFRESH_MS,
  });
  const rows = (res.data ?? [])
    .map(({ id, tender }) => withState(id, tender, now))
    .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
  return { rows, isLoading: res.isLoading && (ids === undefined || ids.length > 0), error: res.error, refetch: res.refetch };
}

export function useMyTenderIds() {
  const client = usePublicClient();
  const { address } = useAccount();
  return useQuery({
    queryKey: ["my-tender-ids", address],
    queryFn: async () =>
      (await fetchCreatedLogs(client!, market, BLINDBID_DEPLOY_BLOCK, address!)).map((l) => l.tenderId) as readonly bigint[],
    enabled: enabled && !!client && !!address,
    refetchInterval: REFRESH_MS,
  });
}

export function useMyBidTenderIds() {
  const client = usePublicClient();
  const { address } = useAccount();
  return useQuery({
    queryKey: ["my-bid-tender-ids", address],
    queryFn: async () => (await fetchBidderTenderIds(client!, market, BLINDBID_DEPLOY_BLOCK, address!)) as readonly bigint[],
    enabled: enabled && !!client && !!address,
    refetchInterval: REFRESH_MS,
  });
}

/** A tender counts as stalled when it has revealed bids but no award this long after the reveal deadline. */
export const STALLED_AFTER_S = 7 * 24 * 60 * 60;

export type BuyerHistory = {
  total: number;
  awarded: number;
  active: number; // Open or Reveal
  awaitingAward: number; // Evaluation, within STALLED_AFTER_S
  stalled: number; // Evaluation for longer than STALLED_AFTER_S
  failed: number; // reveal closed with no revealed bid
  cancelled: number;
};

/** On-chain track record of a buyer address (all tenders it created on this contract). */
export function useBuyerHistory(buyer: Address | undefined) {
  const client = usePublicClient();
  const ids = useQuery({
    queryKey: ["buyer-tender-ids", buyer],
    queryFn: async () => (await fetchCreatedLogs(client!, market, BLINDBID_DEPLOY_BLOCK, buyer!)).map((l) => l.tenderId),
    enabled: enabled && !!client && !!buyer,
    refetchInterval: REFRESH_MS,
  });
  const { rows, isLoading } = useTenders(ids.data ?? []);
  const now = useChainNow();
  const ready = ids.data !== undefined && !isLoading && now !== undefined;
  const h: BuyerHistory = { total: ids.data?.length ?? 0, awarded: 0, active: 0, awaitingAward: 0, stalled: 0, failed: 0, cancelled: 0 };
  for (const r of rows) {
    if (r.state === TenderState.Awarded) h.awarded++;
    else if (r.state === TenderState.Open || r.state === TenderState.Reveal) h.active++;
    else if (r.state === TenderState.Failed) h.failed++;
    else if (r.state === TenderState.Cancelled) h.cancelled++;
    else if (r.state === TenderState.Evaluation) {
      if (now !== undefined && now - Number(r.tender.revealDeadline) > STALLED_AFTER_S) h.stalled++;
      else h.awaitingAward++;
    }
  }
  return { history: ready ? h : undefined, isLoading: !ready };
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

export function useBids(tenderId: bigint | undefined) {
  const client = usePublicClient();
  const data = useTenderData(tenderId);
  const logs = data.data?.logs;
  const bidders = [
    ...new Set((logs ?? []).flatMap((l) => (l.name === "BidSubmitted" && l.first ? [l.bidder] : []))),
  ] as Address[];
  const res = useQuery({
    queryKey: ["bids", tenderId?.toString(), logs?.length],
    queryFn: async (): Promise<BidRow[]> => {
      const cores = await Promise.all(bidders.map((b) => readBid(client!, market, tenderId!, b)));
      const times = await blockTimestamps(
        client!,
        (logs ?? []).filter((l) => l.name === "BidSubmitted").map((l) => l.blockNumber),
      );
      return bidders.map((bidder, i) => ({ bidder, bid: toBid(cores[i], logs!, bidder, times) }));
    },
    enabled: enabled && !!client && !!logs,
    refetchInterval: REFRESH_MS,
  });
  return {
    rows: res.data ?? [],
    isLoading: data.isLoading || res.isLoading,
    error: data.error ?? res.error,
    refetch: async () => {
      await data.refetch();
      await res.refetch();
    },
  };
}

export function useMyBid(tenderId: bigint | undefined) {
  const client = usePublicClient();
  const { address } = useAccount();
  const data = useTenderData(tenderId);
  const logs = data.data?.logs;
  const res = useQuery({
    queryKey: ["my-bid", tenderId?.toString(), address, logs?.length],
    queryFn: async (): Promise<Bid> => {
      const core = await readBid(client!, market, tenderId!, address!);
      const mine = (logs ?? []).filter((l) => l.name === "BidSubmitted" && l.bidder.toLowerCase() === address!.toLowerCase());
      return toBid(core, logs ?? [], address!, await blockTimestamps(client!, mine.map((l) => l.blockNumber)));
    },
    enabled: enabled && !!client && !!address && tenderId !== undefined && !!logs,
    refetchInterval: REFRESH_MS,
  });
  return {
    data: res.data,
    isLoading: data.isLoading || res.isLoading,
    refetch: async () => {
      await data.refetch();
      return res.refetch();
    },
  };
}

/**
 * Native tPOTv3 still locked in this wallet's bid bonds: bonds not withdrawn and not forfeited
 * (a bond is forfeited once the reveal window closed without a reveal).
 */
export function useMyLockedBonds(rows: TenderRow[]) {
  const client = usePublicClient();
  const { address } = useAccount();
  const res = useQuery({
    queryKey: ["my-bonds", address, rows.map((r) => r.id.toString()).join(",")],
    queryFn: async () => Promise.all(rows.map((r) => readBid(client!, market, r.id, address!))),
    enabled: enabled && !!client && !!address && rows.length > 0,
    refetchInterval: REFRESH_MS,
  });
  let lockedWei = 0n;
  let count = 0;
  const bids = new Map<bigint, Bid>();
  rows.forEach((r, i) => {
    const core = res.data?.[i];
    if (!core) return;
    const bid = toBid(core, [], address ?? zeroAddress, new Map());
    bids.set(r.id, bid);
    const revealClosed = r.state !== TenderState.Open && r.state !== TenderState.Reveal;
    const forfeited = revealClosed && !bid.revealed;
    if (bid.bond > 0n && !bid.bondWithdrawn && !forfeited) {
      lockedWei += bid.bond;
      count += 1;
    }
  });
  return { lockedWei, count, bids, isLoading: res.isLoading };
}

// ───────────────────────── writes ─────────────────────────

type Abi = typeof blindBidMarketAbi;
type WriteFn = ContractFunctionName<Abi, "nonpayable" | "payable">;

export type TxStatus = "idle" | "simulating" | "signing" | "confirming" | "success" | "error";

/** How long to wait for a receipt before telling the user the transaction is still pending. */
export const RECEIPT_TIMEOUT_MS = 180_000;

const TX_LABEL: Record<string, string> = {
  createTender: "Publish tender",
  submitBid: "Sealed bid",
  revealBid: "Reveal bid",
  award: "Award tender",
  cancel: "Cancel tender",
  withdrawBond: "Withdraw bond",
  sweepForfeitedBonds: "Send forfeited bonds",
};

/** Mirrors a transaction's stages in a toast (one toast per transaction, updated in place). */
export function txToaster(label: string) {
  const id = toast.show({ kind: "loading", title: label, description: "Checking the transaction…" });
  return {
    signing: () => toast.show({ id, kind: "loading", title: label, description: "Confirm it in your wallet." }),
    confirming: () => toast.show({ id, kind: "loading", title: label, description: "Waiting for PortaldotV3 to confirm…" }),
    success: () => toast.show({ id, kind: "success", title: `${label} confirmed`, description: "Recorded on PortaldotV3." }),
    error: (message: string) => toast.show({ id, kind: "error", title: `${label} failed`, description: message }),
  };
}

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
      const t = txToaster(TX_LABEL[functionName] ?? "Transaction");
      try {
        if (!client || !address || !blindBidAddress) throw new Error("Connect your wallet first.");
        setStatus("simulating");
        // Simulate first to decode contract errors before asking the wallet to send a transaction.
        const { request } = await client.simulateContract({
          address: blindBidAddress,
          abi: blindBidMarketAbi,
          functionName,
          args,
          value,
          account: address,
        } as never);
        setStatus("signing");
        t.signing();
        const txHash = await writeContractAsync({
          ...(request as object),
        } as never);
        setHash(txHash);
        setStatus("confirming");
        t.confirming();
        const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: RECEIPT_TIMEOUT_MS });
        if (receipt.status !== "success") throw new Error("Transaction reverted.");
        setStatus("success");
        t.success();
        return receipt;
      } catch (e) {
        const message = describeError(e);
        setStatus("error");
        setError(message);
        t.error(message);
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
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You rejected the request in your wallet. Nothing was sent.";
    if (e.walk((x) => x instanceof InsufficientFundsError) || /insufficient funds/i.test(e.details ?? e.message)) {
      return "Not enough tPOTv3 in this wallet for the network fee, the storage deposit and any bond. Fund it through its SS58 account, then retry.";
    }
    // -32002 from the wallet: it cannot reach the RPC configured for this network, or another request is pending.
    if (e.walk((x) => x instanceof ResourceUnavailableRpcError)) {
      return `Your wallet could not reach its ${chain.name} RPC (or another request is waiting in the wallet). In your wallet's network settings, set the RPC to ${PORTALDOT_RPC_URL}, then retry.`;
    }
    if (e.walk((x) => x instanceof WaitForTransactionReceiptTimeoutError)) {
      return "No confirmation after 3 minutes. The transaction may still go through — refresh before retrying.";
    }
    if (
      e.walk((x) => x instanceof LimitExceededRpcError || (x instanceof HttpRequestError && x.status === 429))
    ) {
      return "The PortaldotV3 RPC is rate-limiting requests right now. Wait a few seconds and try again.";
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
