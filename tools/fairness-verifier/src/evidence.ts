import { createPublicClient, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, pad, toHex, type Address, type Hex } from "viem";
import { DOMAIN_ABI, ERC721_ABI } from "./abi.js";
import type { Evidence, Kind, RawLog } from "./types.js";

/** Mirrors the contracts' storage. V2 tenders take 5 slots, V1 tenders 3; auctions take 5 in both. */
function layout(kind: Kind, version2: boolean) {
  return kind === "tender"
    ? { arraySlot: 1n, bidsSlot: 2n, stride: version2 ? 5n : 3n }
    : { arraySlot: 0n, bidsSlot: 1n, stride: 5n };
}

export async function collectEvidence(args: { rpc: string; contract: Address; kind: Kind; roundId: bigint; fromBlock?: bigint }): Promise<Evidence> {
  let rpcCalls = 0;
  const client = createPublicClient({ transport: http(args.rpc, { retryCount: 2, timeout: 30_000 }) });
  const call = async <T>(method: string, params: unknown[]): Promise<T> => {
    rpcCalls++;
    return (await client.request({ method, params } as never)) as T;
  };
  const contract = getAddress(args.contract);
  const fromBlock = args.fromBlock ?? 0n;

  const chainId = Number(await call<Hex>("eth_chainId", []));
  const runtimeCode = await call<Hex>("eth_getCode", [contract, "latest"]);
  const head = await call<{ number: Hex; timestamp: Hex }>("eth_getBlockByNumber", ["latest", false]);
  const finalized = await call<{ number: Hex } | null>("eth_getBlockByNumber", ["finalized", false]).catch(() => null);

  let domainTag: Hex | null = null;
  try {
    const data = encodeFunctionData({ abi: DOMAIN_ABI, functionName: "COMMITMENT_DOMAIN" });
    const res = await call<Hex>("eth_call", [{ to: contract, data }, "latest"]);
    if (res && res.length === 66) domainTag = decodeFunctionResult({ abi: DOMAIN_ABI, functionName: "COMMITMENT_DOMAIN", data: res });
  } catch {
    // V1 has no such function
  }
  const { arraySlot, bidsSlot, stride } = layout(args.kind, domainTag !== null);

  const load = (slot: bigint) => call<Hex>("eth_getStorageAt", [contract, toHex(slot, { size: 32 }), "latest"]);
  const asWord = (h: Hex) => pad(h, { size: 32 });

  const roundCount = BigInt(await load(arraySlot));
  const base = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [arraySlot]))) + args.roundId * stride;
  const words = (await Promise.all(Array.from({ length: Number(stride) }, (_, i) => load(base + BigInt(i))))).map(asWord);

  const rawLogs = await call<(Omit<RawLog, "blockNumber" | "logIndex"> & { blockNumber: Hex; logIndex: Hex })[]>("eth_getLogs", [
    { address: contract, fromBlock: toHex(fromBlock), toBlock: "latest", topics: [null, toHex(args.roundId, { size: 32 })] },
  ]);
  const logs: RawLog[] = rawLogs.map((l) => ({
    address: l.address,
    topics: l.topics,
    data: l.data,
    blockNumber: BigInt(l.blockNumber).toString(),
    logIndex: Number(l.logIndex),
    transactionHash: l.transactionHash,
    removed: l.removed,
  }));

  // Bidders are the second topic of every bid log.
  const bidEvents = logs.filter((l) => l.topics[2]);
  const candidates = new Set(bidEvents.map((l) => getAddress(`0x${(l.topics[2] as string).slice(26)}`)));
  const bids: Evidence["bids"] = {};
  const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [args.roundId, bidsSlot]));
  for (const who of candidates) {
    const slot = BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [who, inner])));
    const [a, b] = await Promise.all([load(slot), load(slot + 1n)]);
    bids[who.toLowerCase()] = [asWord(a), asWord(b)];
  }

  // Older blocks and transactions may be pruned by the RPC. That only makes the optional checks unavailable.
  const blockTimes: Record<string, string> = {};
  await Promise.all(
    [...new Set(logs.map((l) => l.blockNumber))].map(async (n) => {
      const b = await call<{ timestamp: Hex } | null>("eth_getBlockByNumber", [toHex(BigInt(n)), false]).catch(() => null);
      if (b) blockTimes[n] = BigInt(b.timestamp).toString();
    }),
  );
  const txSenders: Record<string, Address> = {};
  await Promise.all(
    [...new Set(logs.map((l) => l.transactionHash))].map(async (hash) => {
      const tx = await call<{ from: Address } | null>("eth_getTransactionByHash", [hash]).catch(() => null);
      if (tx) txSenders[hash] = tx.from;
    }),
  );

  let nftOwner: Address | null | undefined;
  let settleReceiptLogs: RawLog[] | null | undefined;
  if (args.kind === "auction" && roundCount > args.roundId) {
    const collection = getAddress(toHex(BigInt(words[1]) & ((1n << 160n) - 1n), { size: 20 }));
    const tokenId = BigInt(words[2]);
    try {
      const data = encodeFunctionData({ abi: ERC721_ABI, functionName: "ownerOf", args: [tokenId] });
      const res = await call<Hex>("eth_call", [{ to: collection, data }, "latest"]);
      nftOwner = getAddress(`0x${res.slice(-40)}`);
    } catch {
      nftOwner = null;
    }
    const settledTopic = keccak256(toHex("AuctionSettled(uint256,address,uint256)"));
    const settle = logs.find((l) => l.topics[0] === settledTopic);
    if (settle) {
      const receipt = await call<{ logs: (Omit<RawLog, "blockNumber" | "logIndex"> & { blockNumber: Hex; logIndex: Hex })[] } | null>("eth_getTransactionReceipt", [settle.transactionHash]).catch(() => null);
      settleReceiptLogs = receipt
        ? receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, blockNumber: BigInt(l.blockNumber).toString(), logIndex: Number(l.logIndex), transactionHash: l.transactionHash }))
        : null;
    }
  }

  return {
    format: "plinths.evidence/1",
    kind: args.kind,
    roundId: args.roundId.toString(),
    chainId,
    contract,
    runtimeCode,
    domainTag,
    head: { number: BigInt(head.number).toString(), timestamp: BigInt(head.timestamp).toString(), finalized: finalized ? BigInt(finalized.number).toString() : null },
    fromBlock: fromBlock.toString(),
    logs,
    roundCount: roundCount.toString(),
    words,
    bids,
    blockTimes,
    txSenders,
    nftOwner,
    settleReceiptLogs,
    rpcCalls,
  };
}
