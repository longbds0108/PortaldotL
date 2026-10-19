"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, decodeEventLog, toHex, type Address, type Hash, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { digestToUri } from "./cid";
import { disputeRegistryAbi } from "./dispute-abi";
import { auctionChecks, tenderChecks, type EngineCheck } from "./dispute-engine";
import { loadTargetContext, type TargetContext } from "./dispute-target";
import {
  DISPUTE_ERROR_TEXT,
  disputesAddress,
  decodeDispute,
  disputeSlot,
  evidenceSchema,
  TargetKind,
  type DisputeCore,
  type DisputeStatus,
  type Evidence,
} from "./disputes";
import { DISPUTES_DEPLOY_BLOCK } from "./env";
import { RECEIPT_TIMEOUT_MS, describeError, txToaster, useChainNow, type TxStatus } from "./hooks";
import { fetchJson } from "./ipfs";
import { fetchRawLogs } from "./market-logs";
import { blockTimestamps } from "./timeline";

export type { TargetContext };

const REFRESH_MS = 15_000;
export const disputesEnabled = !!disputesAddress;

// ───────────────────────── disputes (storage + events) ─────────────────────────

export type DisputePost =
  | { type: "opened"; author: Address; evidenceUri: string; blockNumber: bigint; txHash: Hash; timestamp: bigint }
  | { type: "response"; author: Address; evidenceUri: string; blockNumber: bigint; txHash: Hash; timestamp: bigint }
  | { type: "status"; author: Address; status: DisputeStatus; evidenceUri: string; blockNumber: bigint; txHash: Hash; timestamp: bigint };

type PostWithoutTime = DisputePost extends infer P ? (P extends DisputePost ? Omit<P, "timestamp"> : never) : never;

export type DisputeView = { id: bigint; core: DisputeCore; posts: DisputePost[]; openedAt: bigint; openedBlock: bigint };

async function load(client: PublicClient, slot: bigint): Promise<bigint> {
  return BigInt((await client.getStorageAt({ address: disputesAddress!, slot: toHex(slot, { size: 32 }) })) ?? "0x0");
}

async function fetchDisputes(client: PublicClient, arbiter: Address | undefined): Promise<DisputeView[]> {
  const count = Number(await load(client, 0n));
  const [words, logs] = await Promise.all([
    Promise.all(Array.from({ length: count }, (_, i) => load(client, disputeSlot(BigInt(i))))),
    fetchRawLogs(client, disputesAddress!, DISPUTES_DEPLOY_BLOCK, []),
  ]);
  const posts = new Map<bigint, PostWithoutTime[]>();
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi: disputeRegistryAbi, data: log.data, topics: log.topics });
      const base = { blockNumber: log.blockNumber ?? 0n, txHash: (log.transactionHash ?? "0x") as Hash };
      const a = d.args as Record<string, unknown>;
      const id = a.disputeId as bigint;
      const list = posts.get(id) ?? [];
      if (d.eventName === "DisputeOpened") list.push({ ...base, type: "opened", author: a.opener as Address, evidenceUri: digestToUri(a.evidence as Hex) });
      if (d.eventName === "DisputeResponse") list.push({ ...base, type: "response", author: a.author as Address, evidenceUri: digestToUri(a.evidence as Hex) });
      if (d.eventName === "DisputeStatusChanged")
        // only the arbiter can emit it, so the author is the arbiter
        list.push({ ...base, type: "status", author: arbiter ?? ("0x" as Address), status: Number(a.status) as DisputeStatus, evidenceUri: digestToUri(a.decision as Hex) });
      posts.set(id, list);
    } catch {
      // not one of ours
    }
  }
  const times = await blockTimestamps(client, logs.map((l) => l.blockNumber ?? 0n));
  return words
    .map((w, i) => {
      const id = BigInt(i);
      const list = (posts.get(id) ?? []).map((p) => ({ ...p, timestamp: times.get(p.blockNumber) ?? 0n }) as DisputePost);
      const opened = list.find((p) => p.type === "opened");
      return { id, core: decodeDispute(w), posts: list, openedAt: opened?.timestamp ?? 0n, openedBlock: opened?.blockNumber ?? 0n };
    })
    .reverse(); // newest first
}

export function useArbiter() {
  const res = useReadContract({
    address: disputesAddress,
    abi: disputeRegistryAbi,
    functionName: "arbiter",
    query: { enabled: disputesEnabled, staleTime: Infinity },
  });
  return res.data as Address | undefined;
}

export function useDisputes() {
  const client = usePublicClient();
  const arbiter = useArbiter();
  const q = useQuery({
    queryKey: ["disputes", arbiter],
    queryFn: () => fetchDisputes(client!, arbiter),
    enabled: disputesEnabled && !!client,
    refetchInterval: REFRESH_MS,
  });
  return { rows: q.data ?? [], isLoading: q.isLoading, error: q.error, refetch: () => void q.refetch() };
}

export function useDispute(id: bigint | undefined) {
  const all = useDisputes();
  const row = id === undefined ? undefined : all.rows.find((r) => r.id === id);
  return { row, notFound: !all.isLoading && !all.error && id !== undefined && !row, isLoading: all.isLoading, refetch: all.refetch };
}

// ───────────────────────── the disputed tender or auction ─────────────────────────

export function useTargetContext(kind: TargetKind | undefined, targetId: bigint | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["dispute-target", kind, targetId?.toString()],
    queryFn: () => loadTargetContext(client!, kind!, targetId!),
    enabled: !!client && kind !== undefined && targetId !== undefined,
    staleTime: 30_000,
    retry: 1,
  });
}

/** Verification Engine results for the target (all three checks), computed with chain time. */
export function useEngineChecks(kind: TargetKind | undefined, ctx: TargetContext | undefined): EngineCheck[] | undefined {
  const now = useChainNow();
  if (!ctx?.exists || now === undefined) return undefined;
  if (kind === TargetKind.Tender && ctx.tender) return tenderChecks(ctx.tender, ctx.times, now);
  if (kind === TargetKind.NftAuction && ctx.auction) return auctionChecks(ctx.auction, ctx.times, now);
  return undefined;
}

// ───────────────────────── evidence documents ─────────────────────────

export function useEvidence(uri: string | undefined) {
  return useQuery({
    queryKey: ["dispute-evidence", uri],
    queryFn: async (): Promise<Evidence> => evidenceSchema.parse(await fetchJson(uri!)),
    enabled: !!uri,
    staleTime: Infinity,
    retry: 1,
  });
}

// ───────────────────────── writes ─────────────────────────

const LABEL: Record<string, string> = { openDispute: "Open dispute", respond: "Add response", setStatus: "Update dispute" };

export function describeDisputeError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && DISPUTE_ERROR_TEXT[name]) return DISPUTE_ERROR_TEXT[name];
  }
  return describeError(e);
}

/** Simulate → sign → wait for DisputeRegistry calls, with the shared transaction toasts. */
export function useDisputeTx() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const send = useCallback(
    async (functionName: "openDispute" | "respond" | "setStatus", args: readonly unknown[]): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      const t = txToaster(LABEL[functionName]);
      try {
        if (!client || !address || !disputesAddress) throw new Error("Connect your wallet first.");
        setStatus("simulating");
        const { request } = await client.simulateContract({ address: disputesAddress, abi: disputeRegistryAbi, functionName, args, account: address } as never);
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
        const message = describeDisputeError(e);
        setStatus("error");
        setError(message);
        t.error(message);
        return undefined;
      }
    },
    [client, address, writeContractAsync],
  );

  const busy = status === "simulating" || status === "signing" || status === "confirming";
  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setHash(undefined);
  }, []);
  return { send, status, hash, error, busy, reset };
}

/** Dispute id created by an openDispute receipt. */
export function openedDisputeId(receipt: TransactionReceipt): bigint | undefined {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== disputesAddress?.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: disputeRegistryAbi, data: log.data, topics: log.topics });
      if (d.eventName === "DisputeOpened") return (d.args as { disputeId: bigint }).disputeId;
    } catch {
      // other event
    }
  }
  return undefined;
}
