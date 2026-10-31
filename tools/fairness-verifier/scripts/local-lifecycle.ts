/*
 * Runs complete lifecycles on a throwaway local anvil chain (chain id 31337, never a public network), then writes the
 * evidence each one left behind. These are real transactions on a private chain, labeled as such everywhere they
 * appear. The keys are anvil's public test keys.
 *
 *   cd contracts && forge build && cd ../tools/fairness-verifier && npm run lifecycle
 *
 * Output: test/fixtures/*.evidence.json, test/fixtures/manifest.json and the reports in test/fixtures/*.report.json.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, parseAbi, parseEther, sha256, stringToHex, toHex, type Abi, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { auctionCommitmentOf, verifyAuction } from "../src/auction.js";
import { artifactMatcher } from "../src/common.js";
import { collectEvidence } from "../src/evidence.js";
import { commitmentOf, verifyTender } from "../src/tender.js";
import { AUCTION_DOMAIN_TAG, TENDER_DOMAIN_TAG } from "../src/abi.js";
import type { Evidence, VerifyOptions } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../contracts/out");
const FIXTURES = resolve(here, "../test/fixtures");
const PORT = 8579;
const RPC = `http://127.0.0.1:${PORT}`;

// anvil's default accounts, from its public test mnemonic.
const MNEMONIC = "test test test test test test test test test test test junk";
const [buyer, northwind, riverbank, summit, delta, treasury] = [0, 1, 2, 3, 4, 5].map((addressIndex) => mnemonicToAccount(MNEMONIC, { addressIndex }));

const artifact = (name: string) => JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), "utf8")) as { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex; immutableReferences?: Record<string, { start: number; length: number }[]> } };

const client = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 50 });
const wallet = (account: (typeof buyer)) => createWalletClient({ chain: foundry, transport: http(RPC), account, pollingInterval: 50 });

async function deploy(name: string, args: unknown[]): Promise<Address> {
  const a = artifact(name);
  const hash = await wallet(buyer).deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
}

async function send(from: typeof buyer, address: Address, abi: Abi, functionName: string, args: unknown[], value?: bigint) {
  const hash = await wallet(from).writeContract({ address, abi, functionName, args, value } as never);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

async function expectRevert(from: typeof buyer, address: Address, abi: Abi, functionName: string, args: unknown[]) {
  try {
    await client.simulateContract({ account: from, address, abi, functionName, args } as never);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`${functionName} was expected to revert`);
}

const warpTo = async (t: bigint) => {
  await client.request({ method: "evm_setNextBlockTimestamp", params: [toHex(t)] } as never);
  await client.request({ method: "evm_mine", params: [] } as never);
};
const now = async () => (await client.getBlock()).timestamp;
const doc = (s: string) => keccak256(stringToHex(s));
const save = (name: string, value: unknown) => writeFileSync(resolve(FIXTURES, name), `${JSON.stringify(value, null, 2)}\n`);

const manifest: Record<string, { artifact: string; version: 1 | 2; runtimeKeccak: Hex }> = {};

async function capture(name: string, kind: "tender" | "auction", contract: Address, roundId: bigint, artifactName: string, version: 1 | 2, extra: Partial<VerifyOptions> = {}) {
  // anvil finalizes a fixed distance behind the head, so mine past that distance.
  await client.request({ method: "anvil_mine", params: [toHex(200)] } as never);
  const evidence: Evidence = await collectEvidence({ rpc: RPC, contract, kind, roundId });
  save(`${name}.evidence.json`, evidence);
  manifest[name] = { artifact: artifactName, version, runtimeKeccak: keccak256(evidence.runtimeCode) };
  const opts: VerifyOptions = { confirmations: 12, knownVersion: version, expectedCode: artifactMatcher(artifact(artifactName), `local build of ${artifactName}`), ...extra };
  const report = (kind === "tender" ? verifyTender : verifyAuction)(evidence, opts);
  save(`${name}.report.json`, report);
  console.log(`${report.result.padEnd(11)} ${name}: ${report.outcome.status}`);
  for (const c of report.checks.filter((x) => x.status === "FAIL")) console.log(`            FAIL ${c.id}: ${c.detail}`);
  return report;
}

const marketAbi = artifact("BlindBidMarketV2").abi;
const auctionAbi = artifact("SealedNFTAuctionV2").abi;

/**
 * The fictional demo story (docs/DEMO_DAY_GUIDE.md): a small software business buying a website. Northwind wins on
 * merit though not cheapest, Riverbank is cheaper, Summit is over budget, and Delta never reveals.
 */
async function tenderLifecycle(version: 1 | 2, name: string) {
  const market = await deploy(version === 2 ? "BlindBidMarketV2" : "BlindBidMarket", [treasury.address]);
  const start = await now();
  const submit = start + 3_600n;
  const reveal = submit + 86_400n;
  const bond = parseEther("50");
  const metadata = sha256(stringToHex(JSON.stringify({ title: "Company website (illustrative)" })));
  await send(buyer, market, marketAbi, "createTender", [metadata, parseEther("3000"), parseEther("5000"), submit, reveal, bond]);

  const open = (who: typeof buyer, amount: bigint) => {
    const salt = doc(`salt:${name}:${who.address}`);
    const docKey = doc(`key:${name}:${who.address}`);
    return { who, amount, salt, docKey, commitment: commitmentOf(version, foundry.id, market, 0n, who.address, amount, salt, docKey, TENDER_DOMAIN_TAG) };
  };
  const bids = [open(northwind, parseEther("4200")), open(riverbank, parseEther("3400")), open(summit, parseEther("5600")), open(delta, parseEther("3900"))];
  for (const b of bids) await send(b.who, market, marketAbi, "submitBid", [0n, b.commitment, doc(`cipher:${b.who.address}`)], bond);

  // Riverbank changes its mind before the deadline: only the latest commitment counts.
  const riverbankFinal = open(riverbank, parseEther("3500"));
  const final = { ...riverbankFinal, salt: doc("salt2"), docKey: doc("key2") };
  final.commitment = commitmentOf(version, foundry.id, market, 0n, riverbank.address, final.amount, final.salt, final.docKey, TENDER_DOMAIN_TAG);
  bids[1] = final;
  await send(riverbank, market, marketAbi, "submitBid", [0n, final.commitment, doc("cipher2")]);

  await warpTo(submit);
  for (const b of bids.slice(0, 3)) await send(b.who, market, marketAbi, "revealBid", [0n, b.amount, b.salt, b.docKey]);
  await warpTo(reveal);

  const reasonBytes = stringToHex(JSON.stringify({ version: 1, tenderId: "0", winner: northwind.address, reason: "Illustrative: strongest technical approach within budget; includes the required 12 months of maintenance." }));
  writeFileSync(resolve(FIXTURES, `${name}.reason.json`), Buffer.from(reasonBytes.slice(2), "hex"));
  const reason = sha256(reasonBytes);

  if (version === 2) {
    const refused = await expectRevert(buyer, market, marketAbi, "award", [0n, summit.address, reason]);
    if (!/BidOutOfBudget/.test(refused)) throw new Error(`expected BidOutOfBudget, got ${refused}`);
    console.log("            award to the over-budget bid: refused with BidOutOfBudget");
  }
  await send(buyer, market, marketAbi, "award", [0n, northwind.address, reason]);
  for (const b of bids.slice(0, 3)) await send(b.who, market, marketAbi, "withdrawBond", [0n]);
  await send(buyer, market, marketAbi, "sweepForfeitedBonds", [0n]);
  return capture(name, "tender", market, 0n, version === 2 ? "BlindBidMarketV2" : "BlindBidMarket", version);
}

/** ISSUE-001 on the V1 code: the award goes through, and the verifier catches it afterwards. */
async function v1OutOfBudget() {
  const market = await deploy("BlindBidMarket", [treasury.address]);
  const start = await now();
  const submit = start + 3_600n;
  const reveal = submit + 86_400n;
  await send(buyer, market, marketAbi, "createTender", [doc("m"), parseEther("3000"), parseEther("5000"), submit, reveal, 0n]);
  const amount = parseEther("9000");
  const salt = doc("s");
  const docKey = doc("k");
  await send(summit, market, marketAbi, "submitBid", [0n, commitmentOf(1, foundry.id, market, 0n, summit.address, amount, salt, docKey, TENDER_DOMAIN_TAG), doc("c")]);
  await warpTo(submit);
  await send(summit, market, marketAbi, "revealBid", [0n, amount, salt, docKey]);
  await warpTo(reveal);
  await send(buyer, market, marketAbi, "award", [0n, summit.address, doc("r")]);
  return capture("v1-out-of-budget", "tender", market, 0n, "BlindBidMarket", 1);
}

async function failedTender() {
  const market = await deploy("BlindBidMarketV2", [treasury.address]);
  const start = await now();
  const submit = start + 3_600n;
  const reveal = submit + 86_400n;
  await send(buyer, market, marketAbi, "createTender", [doc("m"), 1n, parseEther("5"), submit, reveal, parseEther("1")]);
  await send(buyer, market, marketAbi, "createTender", [doc("m2"), 1n, parseEther("5"), submit, reveal, 0n]);
  await send(buyer, market, marketAbi, "cancel", [1n]);
  await send(northwind, market, marketAbi, "submitBid", [0n, doc("c"), doc("d")], parseEther("1"));
  await warpTo(reveal);
  await send(buyer, market, marketAbi, "sweepForfeitedBonds", [0n]);
  await capture("v2-no-reveals", "tender", market, 0n, "BlindBidMarketV2", 2);
  await capture("v2-cancelled", "tender", market, 1n, "BlindBidMarketV2", 2);
}

async function openTender() {
  const market = await deploy("BlindBidMarketV2", [treasury.address]);
  const start = await now();
  await send(buyer, market, marketAbi, "createTender", [doc("m"), 1n, parseEther("5"), start + 3_600n, start + 3_600n + 86_400n, 0n]);
  await capture("v2-open", "tender", market, 0n, "BlindBidMarketV2", 2);
}

async function auctionLifecycle(version: 1 | 2, name: string) {
  const nft = await deploy("PlinthsTestNFT", []);
  const auction = await deploy(version === 2 ? "SealedNFTAuctionV2" : "SealedNFTAuction", [treasury.address]);
  const start = await now();
  const bidDeadline = start + 3_600n;
  const revealDeadline = bidDeadline + 86_400n;
  const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }], [parseEther("5"), bidDeadline, revealDeadline]);
  await send(buyer, nft, parseAbi(["function safeTransferFrom(address,address,uint256,bytes)"]), "safeTransferFrom", [buyer.address, auction, 1n, data]);

  const seal = (who: typeof buyer, amount: bigint) => {
    const salt = doc(`salt:${name}:${who.address}`);
    return { who, amount, salt, commitment: auctionCommitmentOf(version, foundry.id, auction, 0n, who.address, amount, salt, AUCTION_DOMAIN_TAG) };
  };
  const a = seal(northwind, parseEther("8"));
  const b = seal(riverbank, parseEther("11"));
  const c = seal(summit, parseEther("11")); // ties with Riverbank but reveals later
  const d = seal(delta, parseEther("20")); // never reveals
  const e = seal(treasury, parseEther("30")); // bid above its deposit, so it cannot count
  await send(a.who, auction, auctionAbi, "placeBid", [0n, a.commitment], parseEther("10"));
  await send(b.who, auction, auctionAbi, "placeBid", [0n, b.commitment], parseEther("15"));
  await send(c.who, auction, auctionAbi, "placeBid", [0n, c.commitment], parseEther("12"));
  await send(d.who, auction, auctionAbi, "placeBid", [0n, d.commitment], parseEther("25"));
  await send(e.who, auction, auctionAbi, "placeBid", [0n, e.commitment], parseEther("6"));

  await warpTo(bidDeadline);
  for (const x of [a, b, c, e]) await send(x.who, auction, auctionAbi, "revealBid", [0n, x.amount, x.salt]);
  await warpTo(revealDeadline);
  await send(delta, auction, auctionAbi, "settle", [0n]);
  for (const x of [a, b, c, d]) await send(x.who, auction, auctionAbi, "withdraw", [0n]);
  await send(buyer, auction, auctionAbi, "withdraw", [0n]);
  return capture(name, "auction", auction, 0n, version === 2 ? "SealedNFTAuctionV2" : "SealedNFTAuction", version);
}

async function main() {
  const anvil = spawn("anvil", ["--port", String(PORT), "--silent", "--balance", "100000"], { stdio: "ignore" });
  try {
    for (let i = 0; ; i++) {
      try {
        await client.getChainId();
        break;
      } catch (e) {
        if (i > 50) throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await tenderLifecycle(2, "v2-awarded");
    await tenderLifecycle(1, "v1-awarded");
    await v1OutOfBudget();
    await failedTender();
    await openTender();
    await auctionLifecycle(2, "v2-auction-sold");
    await auctionLifecycle(1, "v1-auction-sold");
    save("manifest.json", manifest);
  } finally {
    anvil.kill();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
