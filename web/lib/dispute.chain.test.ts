import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

/*
 * End-to-end check of the Dispute Center read layer and the Verification Engine against real BlindBidMarket and
 * DisputeRegistry contracts on a local chain. Skipped unless CHAIN_TEST_RPC points at an anvil node. It WARPS
 * chain time, so use a dedicated anvil:
 *   anvil --chain-id 420420777 --port 8546 &   cd contracts && forge build
 *   CHAIN_TEST_RPC=http://127.0.0.1:8546 pnpm vitest run lib/dispute.chain.test.ts
 * App modules are imported after deployment because they read the contract addresses from env at load time.
 */
const RPC = process.env.CHAIN_TEST_RPC ?? "";

const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdc85365",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];
const [buyer, alice, bob, panel] = KEYS.map((k) => privateKeyToAccount(k));
const ether = (n: bigint) => n * 10n ** 18n;
const doc = (s: string) => keccak256(toHex(s));
const artifact = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../contracts/out/${name}.sol/${name}.json`), "utf8")) as { abi: Abi; bytecode: { object: Hex } };

describe.skipIf(RPC === "")("Dispute Center on a local chain", { timeout: 60_000 }, () => {
  const chain = defineChain({ id: 420420777, name: "local", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC || "http://127.0.0.1:8545"] } } });
  const client = createPublicClient({ chain, transport: http(), pollingInterval: 100 }) as PublicClient;
  const wallet = (i: number) => createWalletClient({ chain, transport: http(), pollingInterval: 100, account: [buyer, alice, bob, panel][i] });
  const sendTo = async (i: number, address: Address, abi: Abi, functionName: string, args: unknown[], value?: bigint) => {
    const r = await client.waitForTransactionReceipt({ hash: await wallet(i).writeContract({ address, abi, functionName, args, value } as never) });
    expect(r.status).toBe("success");
    return r;
  };
  const warp = async (to: bigint) => {
    await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [toHex(to)] as never });
    await client.request({ method: "evm_mine" as never, params: [] as never });
  };
  const now = async () => Number((await client.getBlock()).timestamp);

  it("runs the Verification Engine on a real tender and records a dispute", async () => {
    for (const a of [buyer, alice, bob, panel]) {
      await client.request({ method: "anvil_setBalance" as never, params: [a.address, toHex(ether(10_000n))] as never });
    }
    const m = artifact("BlindBidMarket");
    const market = (await client.waitForTransactionReceipt({ hash: await wallet(0).deployContract({ abi: m.abi, bytecode: m.bytecode.object, args: [panel.address] }) })).contractAddress!;
    const d = artifact("DisputeRegistry");
    const registry = (await client.waitForTransactionReceipt({ hash: await wallet(0).deployContract({ abi: d.abi, bytecode: d.bytecode.object, args: [panel.address] }) })).contractAddress!;
    process.env.NEXT_PUBLIC_BLINDBID_ADDRESS = market;
    process.env.NEXT_PUBLIC_DISPUTES_ADDRESS = registry;

    const { computeCommitment } = await import("./commitment");
    const { loadTargetContext } = await import("./dispute-target");
    const { tenderChecks } = await import("./dispute-engine");
    const { TargetKind, decodeDispute, disputeSlot, DisputeStatus } = await import("./disputes");

    const start = BigInt(await now());
    await sendTo(0, market, m.abi, "createTender", [doc("meta"), ether(5n), ether(10n), start + 3_600n, start + 3_600n + 86_400n, ether(1n)]);
    const commit = (who: Address, amount: bigint, salt: string, key: string) => computeCommitment({ tenderId: 0n, bidder: who, amount18: amount, salt: doc(salt), docKey: doc(key) });
    const bid1 = await sendTo(1, market, m.abi, "submitBid", [0n, commit(alice.address, ether(7n), "a", "ka"), doc("alice")], ether(1n));
    await sendTo(2, market, m.abi, "submitBid", [0n, commit(bob.address, ether(8n), "b", "kb"), doc("bob")], ether(1n));
    await warp(start + 3_600n);
    await sendTo(1, market, m.abi, "revealBid", [0n, ether(7n), doc("a"), doc("ka")]);

    // During the reveal window: reveals verified, Bob still pending.
    let ctx = await loadTargetContext(client, TargetKind.Tender, 0n);
    expect(ctx.exists).toBe(true);
    expect(ctx.bidders).toEqual([alice.address, bob.address]);
    let checks = tenderChecks(ctx.tender!, ctx.times, await now());
    expect(checks.find((c) => c.key === "deadlines")!.status).toBe("pass");
    expect(checks.find((c) => c.key === "reveals")).toMatchObject({ status: "pass", items: [{ status: "pass" }] });
    expect(checks.find((c) => c.key === "settlement")!.status).toBe("pending");

    // After the window: Bob's bond is forfeited (to the treasury), everything checks out.
    await warp(start + 3_600n + 86_400n);
    ctx = await loadTargetContext(client, TargetKind.Tender, 0n);
    checks = tenderChecks(ctx.tender!, ctx.times, await now());
    expect(checks.every((c) => c.status === "pass")).toBe(true);
    expect(await loadTargetContext(client, TargetKind.Tender, 5n)).toMatchObject({ exists: false });

    // A dispute citing the bid transaction, a response, then the panel's decision.
    await sendTo(2, registry, d.abi, "openDispute", [TargetKind.Tender, 0n, 0, doc("claim")]);
    await sendTo(0, registry, d.abi, "respond", [0n, doc("answer")]);
    await sendTo(3, registry, d.abi, "setStatus", [0n, DisputeStatus.Rejected, doc("decision")]);
    const word = BigInt((await client.getStorageAt({ address: registry, slot: toHex(disputeSlot(0n), { size: 32 }) }))!);
    expect(decodeDispute(word)).toEqual({ opener: bob.address.toLowerCase(), kind: TargetKind.Tender, status: DisputeStatus.Rejected, reason: 0, targetId: 0n });
    expect(ctx.events.some((e) => e.txHash === bid1.transactionHash && e.name === "BidSubmitted")).toBe(true);
  });
});
