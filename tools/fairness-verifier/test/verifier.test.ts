import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { encodeAbiParameters, keccak256, toEventSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { verifyAuction } from "../src/auction.js";
import { artifactMatcher, documentDigests, foldReveal } from "../src/common.js";
import { verifyTender } from "../src/tender.js";
import type { Evidence, RawLog, Report, VerifyOptions } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(here, "fixtures", name), "utf8");
const manifest = JSON.parse(fixture("manifest.json")) as Record<string, { version: 1 | 2; runtimeKeccak: Hex }>;
const pins = (JSON.parse(readFileSync(resolve(here, "../src/deployments.json"), "utf8")) as { deployments: { address: string; version: 1 | 2; runtimeKeccak: Hex }[] }).deployments;

const load = (name: string): Evidence => JSON.parse(fixture(`${name}.evidence.json`)) as Evidence;

function optsFor(name: string): VerifyOptions {
  const m = manifest[name];
  return { confirmations: 12, knownVersion: m.version, expectedCode: { source: "pinned", description: "fixture manifest", matches: (code) => ({ ok: keccak256(code) === m.runtimeKeccak }) } };
}

const verify = (ev: Evidence, opts: VerifyOptions): Report => (ev.kind === "tender" ? verifyTender(ev, opts) : verifyAuction(ev, opts));
const run = (name: string, change?: (e: Evidence) => void, extra: Partial<VerifyOptions> = {}): Report => {
  const ev = load(name);
  change?.(ev);
  return verify(ev, { ...optsFor(name), ...extra });
};
const check = (r: Report, id: string) => r.checks.find((c) => c.id === id);
const topic = (signature: string) => toEventSelector(signature);

const REVEALED = topic("BidRevealed(uint256,address,uint256,bytes32,bytes32)");
const AWARDED = topic("TenderAwarded(uint256,address,uint256,bytes32)");
const SELECTION = topic("SelectionRecorded(uint256,address,bytes32,uint32,uint8)");
const SUBMITTED = topic("BidSubmitted(uint256,address,bytes32,bytes32,bool)");
const CREATED = topic("TenderCreated(uint256,address,bytes32,uint256,uint256,uint64,uint64,uint256)");
const SETTLED = topic("AuctionSettled(uint256,address,uint256)");
const AUCTION_REVEALED = topic("BidRevealed(uint256,address,uint256,bytes32,bool)");
const WITHDRAWN = topic("Withdrawn(uint256,address,uint256)");

const logOf = (e: Evidence, t: Hex) => e.logs.find((l) => l.topics[0] === t)!;
const drop = (e: Evidence, t: Hex) => {
  const i = e.logs.findIndex((l) => l.topics[0] === t);
  e.logs.splice(i, 1);
};
/** Replaces 32-byte word `i` of a log's data. */
const setWord = (l: RawLog, i: number, value: bigint | Hex) => {
  const hex = typeof value === "bigint" ? value.toString(16).padStart(64, "0") : value.slice(2);
  const d = l.data.slice(2);
  l.data = `0x${d.slice(0, 64 * i)}${hex}${d.slice(64 * (i + 1))}`;
};
const OTHER = "0x000000000000000000000000000000000000dEaD";
const asTopic = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}` as Hex;

describe("complete rounds verify", () => {
  it.each([
    ["v2-awarded", "AWARDED"],
    ["v1-awarded", "AWARDED"],
    ["v2-no-reveals", "NO_VALID_BIDS"],
    ["v2-cancelled", "CANCELLED"],
    ["v2-auction-sold", "SOLD"],
    ["v1-auction-sold", "SOLD"],
  ])("%s is VERIFIED with outcome %s", (name, status) => {
    const r = run(name);
    expect(r.checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(r.result).toBe("VERIFIED");
    expect(r.exitCode).toBe(0);
    expect(r.outcome.status).toBe(status);
  });

  it("a V2 report carries the on-chain digest, recomputed from logs", () => {
    const r = run("v2-awarded");
    expect(r.revealSet.count).toBe(3);
    expect(r.revealSet.digest).toBe(r.revealSet.onChainDigest);
    let d = `0x${"0".repeat(64)}` as Hex;
    for (const e of r.revealSet.entries) d = foldReveal(d, e.bidder, BigInt(e.amount), e.commitment);
    expect(d).toBe(r.revealSet.digest);
    expect(r.outcome.rule.deterministic).toBe(false);
    expect(r.revealSet.notRevealed).toHaveLength(1);
  });

  it("the same evidence gives the same report", () => {
    expect(run("v2-awarded")).toEqual(run("v2-awarded"));
  });

  it("log order in the evidence file does not matter", () => {
    const shuffled = run("v2-awarded", (e) => e.logs.reverse());
    expect(shuffled.result).toBe("VERIFIED");
    expect(shuffled.revealSet.digest).toBe(run("v2-awarded").revealSet.digest);
  });

  it("the auction winner comes from replaying the reveals, and a tie stays with the earlier reveal", () => {
    const r = run("v2-auction-sold");
    expect(r.outcome.rule.deterministic).toBe(true);
    const counted = r.revealSet.entries.filter((e) => e.counted);
    expect(counted.at(-1)?.bidder.toLowerCase()).toBe(r.outcome.winner?.toLowerCase());
    expect(r.outcome.winningAmount).toBe("11000000000000000000");
    expect(check(r, "winner_recomputed")?.status).toBe("PASS");
    expect(check(r, "nft_delivery")?.status).toBe("PASS");
  });
});

describe("real PortaldotV3 Testnet evidence (read-only capture of the deployed V1 contracts)", () => {
  const pinned = (ev: Evidence): VerifyOptions => {
    const p = pins.find((x) => x.address.toLowerCase() === ev.contract.toLowerCase())!;
    return { confirmations: 12, knownVersion: p.version, expectedChainId: 420420777, expectedCode: { source: "pinned", description: "deployments.json", matches: (c) => ({ ok: keccak256(c) === p.runtimeKeccak }) } };
  };

  it("tender 0 is VERIFIED as a tender nobody revealed; no award exists on this chain yet", () => {
    const ev = load("testnet-tender-0");
    const r = verifyTender(ev, pinned(ev));
    expect(r.result).toBe("VERIFIED");
    expect(r.outcome.status).toBe("NO_VALID_BIDS");
    expect(r.outcome.winner).toBeNull();
    expect(r.revealSet.notRevealed).toHaveLength(2);
    expect(r.subject.contractVersion).toBe(1);
  });

  it("auction 0 is INCOMPLETE: the deadline passed but nobody called settle", () => {
    const ev = load("testnet-auction-0");
    const r = verifyAuction(ev, pinned(ev));
    expect(r.result).toBe("INCOMPLETE");
    expect(r.outcome.status).toBe("NO_SALE_AWAITING_SETTLE");
    expect(check(r, "nft_custody")?.status).toBe("PASS");
  });
});

describe("corrupted evidence is FAILED", () => {
  it("catches the out-of-budget award V1 really accepted on a local chain", () => {
    const r = run("v1-out-of-budget");
    expect(r.result).toBe("FAILED");
    expect(r.exitCode).toBe(1);
    expect(check(r, "budget")?.status).toBe("FAIL");
    expect(check(r, "award")?.status).toBe("PASS");
  });

  it("an altered revealed amount does not open its commitment", () => {
    const r = run("v2-awarded", (e) => setWord(logOf(e, REVEALED), 0, 1n));
    expect(r.result).toBe("FAILED");
    expect(check(r, "commitment_openings")?.status).toBe("FAIL");
  });

  it("an altered salt does not open its commitment", () => {
    const r = run("v1-awarded", (e) => setWord(logOf(e, REVEALED), 1, 1n));
    expect(check(r, "commitment_openings")?.status).toBe("FAIL");
  });

  it("an altered doc key does not open its commitment", () => {
    const r = run("v2-awarded", (e) => setWord(logOf(e, REVEALED), 2, 1n));
    expect(check(r, "commitment_openings")?.status).toBe("FAIL");
  });

  it("a V2 commitment does not open for another contract", () => {
    const r = run("v2-awarded", (e) => {
      e.contract = OTHER;
      e.logs.forEach((l) => (l.address = OTHER));
    });
    expect(check(r, "commitment_openings")?.status).toBe("FAIL");
  });

  it("a V2 commitment does not open for another chain", () => {
    const r = run("v2-awarded", (e) => {
      e.chainId = 1;
    });
    expect(check(r, "commitment_openings")?.status).toBe("FAIL");
  });

  it("a changed winner disagrees with storage", () => {
    const r = run("v2-awarded", (e) => {
      logOf(e, AWARDED).topics[2] = asTopic(OTHER);
    });
    expect(r.result).toBe("FAILED");
    expect(check(r, "award")?.status).toBe("FAIL");
  });

  it("a changed award amount disagrees with the bid", () => {
    const r = run("v1-awarded", (e) => setWord(logOf(e, AWARDED), 0, 1n));
    expect(check(r, "award")?.status).toBe("FAIL");
  });

  it("a swapped reveal order changes the digest the contract recorded", () => {
    const r = run("v2-awarded", (e) => {
      const reveals = e.logs.filter((l) => l.topics[0] === REVEALED);
      const [a, b] = reveals;
      [a.blockNumber, b.blockNumber] = [b.blockNumber, a.blockNumber];
      [a.logIndex, b.logIndex] = [b.logIndex, a.logIndex];
    });
    expect(r.result).toBe("FAILED");
    expect(check(r, "reveal_digest")?.status).toBe("FAIL");
    expect(check(r, "selection_record")?.status).toBe("FAIL");
  });

  it("a tampered stored digest is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.words[4] = keccak256("0x01");
    });
    expect(check(r, "reveal_digest")?.status).toBe("FAIL");
  });

  it("a tampered selection record is caught", () => {
    const r = run("v2-awarded", (e) => setWord(logOf(e, SELECTION), 0, 1n));
    expect(check(r, "selection_record")?.status).toBe("FAIL");
  });

  it("a stored budget that differs from the published one is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.words[3] = `0x${"0".repeat(63)}1` as Hex;
    });
    expect(check(r, "round_exists")?.status).toBe("FAIL");
  });

  it("a bid after the first reveal is an illegal order", () => {
    const r = run("v2-awarded", (e) => {
      const bid = logOf(e, SUBMITTED);
      const last = logOf(e, REVEALED);
      bid.blockNumber = (BigInt(last.blockNumber) + 1n).toString();
    });
    expect(r.result).toBe("FAILED");
  });

  it("a duplicated log is caught", () => {
    const r = run("v2-awarded", (e) => e.logs.push({ ...e.logs[0] }));
    expect(check(r, "log_integrity")?.status).toBe("FAIL");
  });

  it("a log from another contract is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.logs[0].address = OTHER;
    });
    expect(check(r, "log_integrity")?.status).toBe("FAIL");
  });

  it("a block time outside the phase is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.blockTimes[logOf(e, AWARDED).blockNumber] = "1";
    });
    expect(check(r, "timing")?.status).toBe("FAIL");
    expect(r.result).toBe("FAILED");
  });

  it("different runtime code is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.runtimeCode = "0x6000";
    });
    expect(check(r, "contract_identity")?.status).toBe("FAIL");
  });

  it("the wrong chain is caught", () => {
    expect(check(run("v2-awarded", undefined, { expectedChainId: 420420777 }), "chain_id")?.status).toBe("FAIL");
  });

  it("an award sent by someone other than the buyer is caught", () => {
    const r = run("v2-awarded", (e) => {
      e.txSenders[logOf(e, AWARDED).transactionHash] = OTHER;
    });
    expect(check(r, "award")?.status).toBe("FAIL");
  });

  it("auction: a false counted flag, price or payout is caught", () => {
    const counted = run("v2-auction-sold", (e) => setWord(logOf(e, AUCTION_REVEALED), 2, 0n));
    expect(check(counted, "winner_recomputed")?.status).toBe("FAIL");

    const price = run("v2-auction-sold", (e) => setWord(logOf(e, SETTLED), 0, 1n));
    expect(check(price, "settlement")?.status).toBe("FAIL");

    const payout = run("v2-auction-sold", (e) => setWord(logOf(e, WITHDRAWN), 0, 1n));
    expect(check(payout, "payouts")?.status).toBe("FAIL");
  });

  it("auction: a stored winner the replay does not produce is caught", () => {
    const r = run("v2-auction-sold", (e) => {
      const w3 = BigInt(e.words[3]);
      const flags = w3 >> 160n;
      e.words[3] = encodeAbiParameters([{ type: "uint256" }], [(flags << 160n) | BigInt(OTHER)]);
    });
    expect(r.result).toBe("FAILED");
    expect(check(r, "winner_recomputed")?.status).toBe("FAIL");
  });

  it("auction: a settlement receipt without the NFT transfer is caught", () => {
    const r = run("v2-auction-sold", (e) => {
      e.settleReceiptLogs = e.settleReceiptLogs!.filter((l) => l.address.toLowerCase() === e.contract.toLowerCase());
    });
    expect(check(r, "nft_delivery")?.status).toBe("FAIL");
  });
});

describe("missing evidence is INCOMPLETE, never VERIFIED and never FAILED", () => {
  it.each([
    ["a reveal log", REVEALED, "reveal_count"],
    ["a bid log", SUBMITTED, "bid_count"],
    ["the award log", AWARDED, "award"],
    ["the selection log", SELECTION, "selection_record"],
  ])("without %s", (_, t, id) => {
    const r = run("v2-awarded", (e) => drop(e, t as Hex));
    expect(r.result).not.toBe("VERIFIED");
    expect(check(r, id)?.status).not.toBe("PASS");
  });

  it("the creation log", () => {
    const r = run("v2-awarded", (e) => drop(e, CREATED));
    expect(r.result).toBe("INCOMPLETE");
    expect(check(r, "round_exists")?.status).toBe("INCOMPLETE");
  });

  it("no logs at all", () => {
    const r = run("v2-awarded", (e) => {
      e.logs = [];
    });
    expect(r.result).toBe("INCOMPLETE");
  });

  it("a round still open", () => {
    const r = run("v2-open");
    expect(r.result).toBe("INCOMPLETE");
    expect(r.outcome.final).toBe(false);
    expect(r.exitCode).toBe(2);
  });

  it("a log flagged as removed by a reorg", () => {
    const r = run("v2-awarded", (e) => {
      e.logs[0].removed = true;
    });
    expect(check(r, "log_canonical")?.status).toBe("INCOMPLETE");
    expect(r.result).toBe("INCOMPLETE");
  });

  it("events above the finalized head", () => {
    const r = run("v2-awarded", (e) => {
      e.head.finalized = "1";
    });
    expect(check(r, "finality")?.status).toBe("INCOMPLETE");
    expect(r.result).toBe("INCOMPLETE");
  });

  it("no finalized tag and a shallow event", () => {
    const r = run("v2-awarded", (e) => {
      e.head.finalized = null;
      e.head.number = (e.logs.reduce((m, l) => (BigInt(l.blockNumber) > m ? BigInt(l.blockNumber) : m), 0n) + 2n).toString();
    });
    expect(check(r, "finality")?.status).toBe("INCOMPLETE");
  });

  it("a V2 contract with no code comparison", () => {
    const ev = load("v2-awarded");
    const r = verifyTender(ev, { confirmations: 12 });
    expect(check(r, "contract_identity")?.status).toBe("INCOMPLETE");
    expect(r.result).toBe("INCOMPLETE");
    expect(r.subject.contractVersion).toBe(2);
  });

  it("pruned block times and receipts only leave optional checks unchecked", () => {
    const r = run("v2-auction-sold", (e) => {
      e.blockTimes = {};
      e.txSenders = {};
      e.settleReceiptLogs = null;
    });
    expect(check(r, "timing")?.status).toBe("NOT_CHECKED");
    expect(check(r, "nft_delivery")?.status).toBe("NOT_CHECKED");
    expect(r.result).toBe("VERIFIED");
  });
});

describe("what the tool does not know is UNSUPPORTED", () => {
  it("no contract at the address", () => {
    const r = run("v2-awarded", (e) => {
      e.runtimeCode = "0x";
    });
    expect(r.result).toBe("UNSUPPORTED");
    expect(r.exitCode).toBe(3);
  });

  it("an unknown contract with no domain tag", () => {
    const ev = load("v1-awarded");
    expect(verifyTender(ev, { confirmations: 12 }).result).toBe("UNSUPPORTED");
  });

  it("a compared contract with no stated version", () => {
    const ev = load("v1-awarded");
    const r = verifyTender(ev, { confirmations: 12, expectedCode: { source: "artifact", description: "x", matches: () => ({ ok: true }) } });
    expect(r.result).toBe("UNSUPPORTED");
  });

  it("an event signature from a newer contract version", () => {
    const r = run("v2-awarded", (e) => {
      e.logs[0].topics[0] = keccak256("0x1234");
    });
    expect(r.result).toBe("UNSUPPORTED");
    expect(check(r, "log_schema")?.status).toBe("UNSUPPORTED");
  });
});

describe("award reason document", () => {
  const reason = new Uint8Array(Buffer.from(fixture("v2-awarded.reason.json")));

  it("passes when it hashes to the on-chain digest and names this round", () => {
    const r = run("v2-awarded", undefined, { reasonDocument: reason });
    expect(check(r, "reason_document")?.status).toBe("PASS");
    expect(r.result).toBe("VERIFIED");
  });

  it("fails for any other document", () => {
    const r = run("v2-awarded", undefined, { reasonDocument: new TextEncoder().encode("{}") });
    expect(check(r, "reason_document")?.status).toBe("FAIL");
    expect(r.result).toBe("FAILED");
  });

  it("is reported as not checked when absent, and named as a limit", () => {
    expect(check(run("v2-awarded"), "reason_document")?.status).toBe("NOT_CHECKED");
  });

  it("rebuilds the dag-pb digest IPFS gives a small file", () => {
    // `ipfs add` of "hello world\n" is the well-known CID QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o.
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n;
    for (const ch of "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o") n = n * 58n + BigInt(B58.indexOf(ch));
    const digest = `0x${n.toString(16).padStart(68, "0").slice(4)}`;
    expect(documentDigests(new TextEncoder().encode("hello world\n")).dagPb).toBe(digest);
  });
});

describe("compiled artifact comparison", () => {
  const artifact = { deployedBytecode: { object: "0x60aa0000bb" as Hex, immutableReferences: { "1": [{ start: 2, length: 2 }] } } };
  it("ignores immutable slots and nothing else", () => {
    const m = artifactMatcher(artifact, "t");
    expect(m.matches("0x60aa1234bb").ok).toBe(true);
    expect(m.matches("0x60aa1234bb").note).toContain("1234");
    expect(m.matches("0x60ab1234bb").ok).toBe(false);
    expect(m.matches("0x60aa1234").ok).toBe(false);
  });
});

describe("report format", () => {
  const schema = JSON.parse(readFileSync(resolve(here, "../schemas/proof-of-fairness-1.0.schema.json"), "utf8")) as object;
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

  it.each(["v2-awarded", "v1-awarded", "v1-out-of-budget", "v2-no-reveals", "v2-cancelled", "v2-open", "v2-auction-sold", "v1-auction-sold"])("%s matches the schema", (name) => {
    const ok = validate(run(name));
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it("an UNSUPPORTED report matches the schema too", () => {
    expect(validate(verifyTender(load("v1-awarded"), { confirmations: 12 }))).toBe(true);
  });

  it("rejects a report with no limitations or an invented result", () => {
    const r = run("v2-awarded");
    expect(validate({ ...r, limitations: [] })).toBe(false);
    expect(validate({ ...r, result: "TRUSTLESS" })).toBe(false);
  });

  it("states what is sealed, for each item separately", () => {
    const r = run("v2-awarded");
    expect(r.sealing.identity).toMatch(/NOT hidden/);
    expect(r.sealing.amount).toMatch(/Hidden until/);
    expect(r.limitations.join(" ")).toMatch(/not merit/);
  });
});

describe("command line", () => {
  const cwd = resolve(here, "..");
  const cli = (...args: string[]) => spawnSync("npx", ["tsx", "src/cli.ts", ...args], { cwd, encoding: "utf8" });

  it("replays saved evidence offline and exits 0 on VERIFIED", () => {
    const r = cli("--evidence", "test/fixtures/testnet-tender-0.evidence.json");
    expect(r.status).toBe(0);
    expect((JSON.parse(r.stdout) as Report).result).toBe("VERIFIED");
  });

  it("exits 3 for evidence from a contract it cannot identify", () => {
    expect(cli("--evidence", "test/fixtures/v1-out-of-budget.evidence.json").status).toBe(3);
  });

  it("exits 64 on bad usage", () => {
    expect(cli("--tender").status).toBe(64);
    expect(cli("--tender", "1").status).toBe(64);
  });

  it("exits 2 when the RPC cannot be reached", () => {
    expect(cli("--rpc", "http://127.0.0.1:1", "--contract", "0x6e79287f62B47307B5b7349072c51AdAF8833d54", "--tender", "0").status).toBe(2);
  });

});
