import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { blindBidMarketAbi } from "./abi";
import { computeCommitment } from "./commitment";
import { BLINDBID_VERSION } from "./env";
import { TenderState } from "./contracts";
import { fetchBidderTenderIds, fetchCreatedLogs, fetchTenderLogs } from "./market-logs";
import { readBid, readTender, readTenderCount, tenderState } from "./market-storage";

/*
 * End-to-end check of the app's read layer (storage + logs) against a real BlindBidMarket on a local chain.
 * Skipped unless CHAIN_TEST_RPC points at an anvil node. It WARPS chain time, so use a dedicated anvil — not the
 * one a dev server is reading:
 *   anvil --chain-id 420420777 &   cd contracts && forge build
 *   CHAIN_TEST_RPC=http://127.0.0.1:8545 pnpm vitest run lib/market.chain.test.ts
 * Add NEXT_PUBLIC_BLINDBID_VERSION=2 to run it against BlindBidMarketV2.
 */
const RPC = process.env.CHAIN_TEST_RPC ?? "";

// anvil's default dev keys (public, test-only)
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdc85365",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];
const [buyer, alice, bob, carol] = KEYS.map((k) => privateKeyToAccount(k));
const ether = (n: bigint) => n * 10n ** 18n;
const doc = (s: string) => keccak256(toHex(s));

describe.skipIf(RPC === "")("BlindBidMarket on a local chain, read the way the app reads it", { timeout: 60_000 }, () => {
  const chain = defineChain({ id: 420420777, name: "local", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC || "http://127.0.0.1:8545"] } } });
  const client = createPublicClient({ chain, transport: http(), pollingInterval: 100 }) as PublicClient;
  const wallet = (i: number) => createWalletClient({ chain, transport: http(), pollingInterval: 100, account: [buyer, alice, bob, carol][i] });

  const send = async (i: number, functionName: string, args: unknown[], value?: bigint) => {
    const hash = await wallet(i).writeContract({ address: market, abi: blindBidMarketAbi, functionName, args, value } as never);
    const r = await client.waitForTransactionReceipt({ hash });
    expect(r.status).toBe("success");
    return r;
  };
  const warp = async (to: bigint) => {
    await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [toHex(to)] as never });
    await client.request({ method: "evm_mine" as never, params: [] as never });
  };
  const now = async () => Number((await client.getBlock()).timestamp);

  let market: Address;
  let start: bigint;

  it("deploys and creates a tender", async () => {
    for (const a of [buyer, alice, bob, carol]) {
      await client.request({ method: "anvil_setBalance" as never, params: [a.address, toHex(ether(1_000n))] as never });
    }
    // Read lazily: contracts/out only exists after `forge build`, and this suite is skipped without a chain.
    const artifact = JSON.parse(readFileSync(resolve(__dirname, BLINDBID_VERSION === 2 ? "../../contracts/out/BlindBidMarketV2.sol/BlindBidMarketV2.json" : "../../contracts/out/BlindBidMarket.sol/BlindBidMarket.json"), "utf8"));
    const hash = await wallet(0).deployContract({ abi: blindBidMarketAbi, bytecode: artifact.bytecode.object, args: [buyer.address] });
    market = (await client.waitForTransactionReceipt({ hash })).contractAddress!;
    start = BigInt(await now());

    await send(0, "createTender", [doc("meta"), ether(5_000n), ether(10_000n), start + 3_600n, start + 3_600n + 86_400n, ether(10n)]);
    expect(await readTenderCount(client, market)).toBe(1n);
    const t = await readTender(client, market, 0n);
    expect(t.buyer).toBe(buyer.address.toLowerCase());
    expect(t.bidBond).toBe(ether(10n));
    expect(tenderState(t, await now())).toBe(TenderState.Open);

    const created = await fetchCreatedLogs(client, market, 0n);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ tenderId: 0n, metadata: doc("meta"), budgetMin: ether(5_000n), budgetMax: ether(10_000n) });
    expect(await fetchCreatedLogs(client, market, 0n, alice.address)).toHaveLength(0);
  });

  it("seals three bids, one replaced, and reads them back", async () => {
    const commit = (who: Address, amount: bigint, salt: string, key: string) =>
      computeCommitment({ tenderId: 0n, bidder: who, amount18: amount, salt: doc(salt), docKey: doc(key), domain: BLINDBID_VERSION === 2 ? { chainId: 420420777, contract: market } : null });
    await send(1, "submitBid", [0n, commit(alice.address, ether(7_500n), "a", "ka"), doc("alice-doc")], ether(10n));
    await send(2, "submitBid", [0n, commit(bob.address, ether(9_000n), "b", "kb"), doc("bob-doc")], ether(10n));
    await send(2, "submitBid", [0n, commit(bob.address, ether(6_900n), "b2", "kb2"), doc("bob-doc-2")], 0n); // replacement
    await send(3, "submitBid", [0n, commit(carol.address, ether(8_100n), "c", "kc"), doc("carol-doc")], ether(10n));

    const t = await readTender(client, market, 0n);
    expect(t.bidCount).toBe(3);
    const logs = await fetchTenderLogs(client, market, 0n, t.createdBlock);
    const firsts = logs.filter((l) => l.name === "BidSubmitted" && l.first);
    expect(firsts.map((l) => ("bidder" in l ? l.bidder : ""))).toEqual([alice.address, bob.address, carol.address]);
    const bobLatest = logs.filter((l) => l.name === "BidSubmitted" && l.bidder === bob.address).at(-1);
    expect(bobLatest).toMatchObject({ encryptedDoc: doc("bob-doc-2"), first: false });
    expect(await fetchBidderTenderIds(client, market, 0n, bob.address)).toEqual([0n]);

    const b = await readBid(client, market, 0n, bob.address);
    expect(b.commitment).toBe(commit(bob.address, ether(6_900n), "b2", "kb2"));
    expect(b.bond).toBe(ether(10n));
    expect(b.amount).toBe(0n); // sealed
  });

  it("reveals, awards, pays bonds and sweeps forfeits", async () => {
    await warp(start + 3_600n);
    await send(1, "revealBid", [0n, ether(7_500n), doc("a"), doc("ka")]);
    await send(2, "revealBid", [0n, ether(6_900n), doc("b2"), doc("kb2")]);

    const bob1 = await readBid(client, market, 0n, bob.address);
    expect(bob1).toMatchObject({ revealed: true, amount: ether(6_900n) });
    const t1 = await readTender(client, market, 0n);
    expect(t1.revealedCount).toBe(2);
    expect(tenderState(t1, await now())).toBe(TenderState.Reveal);
    const reveal = (await fetchTenderLogs(client, market, 0n, t1.createdBlock)).find((l) => l.name === "BidRevealed" && l.bidder === bob.address);
    expect(reveal).toMatchObject({ salt: doc("b2"), docKey: doc("kb2"), amount: ether(6_900n) });

    await warp(start + 3_600n + 86_400n);
    expect(tenderState(await readTender(client, market, 0n), await now())).toBe(TenderState.Evaluation);
    await send(0, "award", [0n, bob.address, doc("reason")]);
    const t2 = await readTender(client, market, 0n);
    expect(t2).toMatchObject({ awarded: true, winner: bob.address.toLowerCase() });
    expect(tenderState(t2, await now())).toBe(TenderState.Awarded);
    const awarded = (await fetchTenderLogs(client, market, 0n, t2.createdBlock)).find((l) => l.name === "TenderAwarded");
    expect(awarded).toMatchObject({ winner: bob.address, amount: ether(6_900n), reason: doc("reason") });

    await send(1, "withdrawBond", [0n]);
    expect((await readBid(client, market, 0n, alice.address)).bondWithdrawn).toBe(true);
    await send(0, "sweepForfeitedBonds", [0n]); // carol never revealed
    expect((await readTender(client, market, 0n)).forfeitSwept).toBe(true);
    expect(await client.getBalance({ address: market })).toBe(ether(10n)); // only bob's bond left
  });
});
