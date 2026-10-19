import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseEventLogs, toHex, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { AuctionState, encodeListingData, erc721Abi, sealedNftAuctionAbi } from "./nft-auction";
import { computeNftCommitment } from "./nft-commitment";
import { fetchAuctionLogs, fetchBidderAuctionIds, fetchSellerAuctionIds } from "./nft-logs";
import { auctionState, readAuction, readAuctionBid, readAuctionCount, withdrawableAmount } from "./nft-storage";

/*
 * End-to-end check of the NFT auction read layer (storage + logs) against real SealedNFTAuction and
 * PlinthsTestNFT contracts on a local chain. Skipped unless CHAIN_TEST_RPC points at an anvil node. It WARPS
 * chain time, so use a dedicated anvil:
 *   anvil --chain-id 420420777 --port 8546 &   cd contracts && forge build
 *   CHAIN_TEST_RPC=http://127.0.0.1:8546 pnpm vitest run lib/nft.chain.test.ts
 */
const RPC = process.env.CHAIN_TEST_RPC ?? "";

// anvil's default dev keys (public, test-only)
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdc85365",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];
const [seller, alice, bob, carol] = KEYS.map((k) => privateKeyToAccount(k));
const ether = (n: bigint) => n * 10n ** 18n;
const salt = (s: string) => keccak256(toHex(s));
const artifact = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../contracts/out/${name}.sol/${name}.json`), "utf8")) as { abi: Abi; bytecode: { object: Hex } };

describe.skipIf(RPC === "")("SealedNFTAuction on a local chain, read the way the app reads it", { timeout: 60_000 }, () => {
  const chain = defineChain({ id: 420420777, name: "local", nativeCurrency: { name: "tPOTv3", symbol: "tPOTv3", decimals: 18 }, rpcUrls: { default: { http: [RPC || "http://127.0.0.1:8545"] } } });
  const client = createPublicClient({ chain, transport: http(), pollingInterval: 100 }) as PublicClient;
  const wallet = (i: number) => createWalletClient({ chain, transport: http(), pollingInterval: 100, account: [seller, alice, bob, carol][i] });

  const sendTo = async (i: number, address: Address, abi: Abi, functionName: string, args: unknown[], value?: bigint) => {
    const hash = await wallet(i).writeContract({ address, abi, functionName, args, value } as never);
    const r = await client.waitForTransactionReceipt({ hash });
    expect(r.status).toBe("success");
    return r;
  };
  const send = (i: number, functionName: string, args: unknown[], value?: bigint) => sendTo(i, auction, sealedNftAuctionAbi as Abi, functionName, args, value);
  const warp = async (to: bigint) => {
    await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [toHex(to)] as never });
    await client.request({ method: "evm_mine" as never, params: [] as never });
  };
  const now = async () => Number((await client.getBlock()).timestamp);
  const balance = (a: Address) => client.getBalance({ address: a });

  let auction: Address;
  let nft: Address;
  let bidDeadline: bigint;
  let revealDeadline: bigint;

  it("deploys the test collection and the auction, then lists NFT #2", async () => {
    for (const a of [seller, alice, bob, carol]) {
      await client.request({ method: "anvil_setBalance" as never, params: [a.address, toHex(ether(1_000n))] as never });
    }
    const n = artifact("PlinthsTestNFT");
    nft = (await client.waitForTransactionReceipt({ hash: await wallet(0).deployContract({ abi: n.abi, bytecode: n.bytecode.object }) })).contractAddress!;
    const a = artifact("SealedNFTAuction");
    auction = (await client.waitForTransactionReceipt({ hash: await wallet(0).deployContract({ abi: a.abi, bytecode: a.bytecode.object, args: [carol.address] }) }))
      .contractAddress!;

    expect(await client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [2n] })).toBe(seller.address);
    expect(await client.readContract({ address: nft, abi: erc721Abi, functionName: "tokenURI", args: [2n] })).toMatch(/^ipfs:\/\//);

    bidDeadline = BigInt(await now()) + 3_600n;
    revealDeadline = bidDeadline + 86_400n;
    const data = encodeListingData({ reserve18: ether(5n), bidDeadline, revealDeadline });
    const r = await sendTo(0, nft, erc721Abi as Abi, "safeTransferFrom", [seller.address, auction, 2n, data]);
    const created = parseEventLogs({ abi: sealedNftAuctionAbi, logs: r.logs, eventName: "AuctionCreated" });
    expect(created[0].args.auctionId).toBe(0n);

    expect(await readAuctionCount(client, auction)).toBe(1n);
    const core = await readAuction(client, auction, 0n);
    expect(core).toMatchObject({ seller: seller.address.toLowerCase(), collection: nft.toLowerCase(), tokenId: 2n, reservePrice: ether(5n), bidDeadline, revealDeadline });
    expect(auctionState(core, await now())).toBe(AuctionState.Open);
    expect(await fetchSellerAuctionIds(client, auction, 0n, seller.address)).toEqual([0n]);
  });

  it("rejects a listing with a too-short reveal window, with the auction's reason", async () => {
    const data = encodeListingData({ reserve18: 0n, bidDeadline, revealDeadline: bidDeadline + 60n });
    await expect(
      client.simulateContract({ account: seller, address: nft, abi: [...erc721Abi, ...sealedNftAuctionAbi.filter((x) => x.type === "error")], functionName: "safeTransferFrom", args: [seller.address, auction, 1n, data] }),
    ).rejects.toThrow(/InvalidDeadlines/);
  });

  it("seals, replaces, reveals and settles, with payouts matching withdrawableAmount", async () => {
    await send(1, "placeBid", [0n, computeNftCommitment({ auctionId: 0n, bidder: alice.address, amount18: ether(7n), salt: salt("a") })], ether(10n));
    await send(2, "placeBid", [0n, computeNftCommitment({ auctionId: 0n, bidder: bob.address, amount18: ether(8n), salt: salt("b") })], ether(10n));
    // bob raises his price and tops up the deposit
    await send(2, "placeBid", [0n, computeNftCommitment({ auctionId: 0n, bidder: bob.address, amount18: ether(11n), salt: salt("b2") })], ether(2n));
    await send(3, "placeBid", [0n, computeNftCommitment({ auctionId: 0n, bidder: carol.address, amount18: ether(20n), salt: salt("c") })], ether(25n)); // never reveals

    expect((await readAuction(client, auction, 0n)).bidCount).toBe(3);
    const bobBid = await readAuctionBid(client, auction, 0n, bob.address);
    expect(bobBid).toMatchObject({ deposit: ether(12n), amount: 0n, revealed: false });
    expect(await fetchBidderAuctionIds(client, auction, 0n, bob.address)).toEqual([0n]);

    await warp(bidDeadline);
    await send(1, "revealBid", [0n, ether(7n), salt("a")]);
    await send(2, "revealBid", [0n, ether(11n), salt("b2")]);
    let core = await readAuction(client, auction, 0n);
    expect(core).toMatchObject({ highestBidder: bob.address.toLowerCase(), highestBid: ether(11n), revealedCount: 2 });
    expect(auctionState(core, await now())).toBe(AuctionState.Reveal);

    // alice is outbid: free right away, exactly as the app predicts
    const t = await now();
    const aliceBid = await readAuctionBid(client, auction, 0n, alice.address);
    expect(withdrawableAmount(core, aliceBid, alice.address, t)).toBe(ether(10n));
    expect(withdrawableAmount(core, bobBid, bob.address, t)).toBe(0n);

    const logs = await fetchAuctionLogs(client, auction, 0n, core.createdBlock);
    expect(logs.map((l) => l.name)).toEqual(["AuctionCreated", "BidPlaced", "BidPlaced", "BidPlaced", "BidPlaced", "BidRevealed", "BidRevealed"]);
    const revealed = logs.filter((l) => l.name === "BidRevealed");
    expect(revealed[1]).toMatchObject({ bidder: bob.address, amount: ether(11n), salt: salt("b2"), counted: true });

    await warp(revealDeadline);
    core = await readAuction(client, auction, 0n);
    expect(auctionState(core, await now())).toBe(AuctionState.Settlement);
    await send(3, "settle", [0n]);
    expect(await client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [2n] })).toBe(bob.address);
    core = await readAuction(client, auction, 0n);
    expect(auctionState(core, await now())).toBe(AuctionState.Settled);

    // every payout equals what the app shows before the click
    const payouts: [number, Address, bigint][] = [
      [0, seller.address, ether(11n)],
      [1, alice.address, ether(10n)],
      [2, bob.address, ether(1n)], // 12 deposit - 11 price
    ];
    for (const [i, who, expected] of payouts) {
      const c = await readAuction(client, auction, 0n);
      const predicted = withdrawableAmount(c, await readAuctionBid(client, auction, 0n, who), who, await now());
      expect(predicted).toBe(expected);
      const before = await balance(who);
      const r = await send(i, "withdraw", [0n]);
      const gas = r.gasUsed * r.effectiveGasPrice;
      expect((await balance(who)) - before + gas).toBe(expected);
    }
    // carol never revealed: 10% penalty, which goes to the treasury (carol herself here)
    const carolBid = await readAuctionBid(client, auction, 0n, carol.address);
    expect(withdrawableAmount(core, carolBid, carol.address, await now())).toBe(ether(25n) - ether(25n) / 10n);
    await send(3, "withdraw", [0n]);
    expect(await balance(auction)).toBe(0n);
  });

  it("lets the seller cancel an auction without bids", async () => {
    const bd = BigInt(await now()) + 3_600n;
    await sendTo(0, nft, erc721Abi as Abi, "safeTransferFrom", [seller.address, auction, 3n, encodeListingData({ reserve18: 0n, bidDeadline: bd, revealDeadline: bd + 86_400n })]);
    await send(0, "settle", [1n]);
    expect(auctionState(await readAuction(client, auction, 1n), await now())).toBe(AuctionState.Cancelled);
    expect(await client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [3n] })).toBe(seller.address);
  });
});
