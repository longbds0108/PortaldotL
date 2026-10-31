import { decodeEventLog, encodeAbiParameters, keccak256, sha256, toHex, type Abi, type Address, type Hex } from "viem";
import { AUCTION_DOMAIN_TAG, TENDER_DOMAIN_TAG } from "./abi.js";
import type { Check, CheckStatus, Evidence, ExpectedCode, RawLog, Report, Result, VerifyOptions } from "./types.js";
import { EXIT_CODE } from "./types.js";

export const ZERO32 = `0x${"0".repeat(64)}` as Hex;
export const ZERO_ADDRESS = `0x${"0".repeat(40)}` as Address;

export const lower = (a: string) => a.toLowerCase();
export const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && lower(a) === lower(b);
export const bits = (w: bigint, offset: number, size: number) => (w >> BigInt(offset)) & ((1n << BigInt(size)) - 1n);
export const addr = (w: bigint) => toHex(bits(w, 0, 160), { size: 20 }) as Address;

export class Checks {
  list: Check[] = [];
  add(id: string, status: CheckStatus, detail: string, required = true) {
    this.list.push({ id, status, required, detail });
  }
  /** PASS, or FAIL carrying every problem found. */
  all(id: string, problems: string[], okDetail: string, required = true) {
    this.add(id, problems.length ? "FAIL" : "PASS", problems.length ? problems.join("; ") : okDetail, required);
  }
}

export function sortLogs(logs: RawLog[]): RawLog[] {
  return [...logs].sort((a, b) => {
    const d = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    return d !== 0n ? (d < 0n ? -1 : 1) : a.logIndex - b.logIndex;
  });
}

export type Decoded = { name: string; args: Record<string, never>; log: RawLog };

/** Decodes in chain order. An event this version of the tool does not know means the contract is not one it supports. */
export function decodeAll(logs: RawLog[], abi: Abi): { events: Decoded[]; unknown: RawLog[] } {
  const events: Decoded[] = [];
  const unknown: RawLog[] = [];
  for (const log of sortLogs(logs)) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      events.push({ name: String(d.eventName), args: d.args as unknown as Record<string, never>, log });
    } catch {
      unknown.push(log);
    }
  }
  return { events, unknown };
}

/** Checks shared by tenders and auctions: right chain, right code, sound logs, settled history. */
export function checkEnvelope(c: Checks, ev: Evidence, opts: VerifyOptions, abi: Abi): { events: Decoded[]; version: 1 | 2 | null; expectedTag: Hex; supported: boolean } {
  const expectedTag = ev.kind === "tender" ? TENDER_DOMAIN_TAG : AUCTION_DOMAIN_TAG;

  if (opts.expectedChainId !== undefined && opts.expectedChainId !== ev.chainId) {
    c.add("chain_id", "FAIL", `expected chain ${opts.expectedChainId}, evidence is from chain ${ev.chainId}`);
  } else {
    c.add("chain_id", "PASS", `chain ${ev.chainId}`);
  }

  // Which rules apply depends on the version, so an unknown contract cannot be judged at all.
  let version: 1 | 2 | null = opts.knownVersion ?? null;
  if (!version && same(ev.domainTag, expectedTag)) version = 2;
  const hasCode = ev.runtimeCode !== "0x" && ev.runtimeCode.length > 2;
  if (!hasCode) {
    c.add("contract_identity", "UNSUPPORTED", "no contract code at this address");
    return { events: [], version, expectedTag, supported: false };
  }
  if (opts.expectedCode) {
    const m = opts.expectedCode.matches(ev.runtimeCode);
    c.add("contract_identity", m.ok ? "PASS" : "FAIL", `${opts.expectedCode.description}: ${m.ok ? "runtime code matches" : "runtime code differs"}${m.note ? ` (${m.note})` : ""}`);
  } else if (version === 2) {
    c.add("contract_identity", "INCOMPLETE", "the contract reports the V2 domain tag, but its code was not compared to any source; pass --artifact");
  } else {
    c.add("contract_identity", "UNSUPPORTED", "unknown contract: not pinned and no V2 domain tag. Pass --artifact if you compiled it, with --contract-version");
    return { events: [], version, expectedTag, supported: false };
  }
  if (!version) {
    c.add("contract_version", "UNSUPPORTED", "the code was compared, but no version is known; pass --contract-version 1 or 2");
    return { events: [], version, expectedTag, supported: false };
  }
  if (version === 2 && !same(ev.domainTag, expectedTag)) {
    c.add("domain_tag", "FAIL", `COMMITMENT_DOMAIN() returned ${ev.domainTag}, expected ${expectedTag}`);
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const l of ev.logs) {
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) problems.push(`duplicate log ${key}`);
    seen.add(key);
    if (!same(l.address, ev.contract)) problems.push(`log from another contract: ${l.address}`);
    if (BigInt(l.blockNumber) > BigInt(ev.head.number)) problems.push(`log in block ${l.blockNumber}, after the head`);
    if (BigInt(l.blockNumber) < BigInt(ev.fromBlock)) problems.push(`log in block ${l.blockNumber}, before the queried range`);
  }
  c.all("log_integrity", problems, `${ev.logs.length} logs: no duplicates, all from this contract and inside the queried range`);

  const removed = ev.logs.filter((l) => l.removed);
  if (removed.length) c.add("log_canonical", "INCOMPLETE", `${removed.length} log(s) flagged as removed by a reorg; fetch again`);

  const { events, unknown } = decodeAll(ev.logs, abi);
  if (unknown.length) {
    c.add("log_schema", "UNSUPPORTED", `${unknown.length} log(s) with an unknown or undecodable signature, first topic ${unknown[0].topics[0]}`);
  } else {
    c.add("log_schema", "PASS", `all ${events.length} logs decode against the expected event signatures`);
  }

  const last = ev.logs.reduce((m, l) => (BigInt(l.blockNumber) > m ? BigInt(l.blockNumber) : m), 0n);
  if (ev.head.finalized !== null) {
    if (last <= BigInt(ev.head.finalized)) c.add("finality", "PASS", `latest event in block ${last}, finalized head ${ev.head.finalized}`);
    else c.add("finality", "INCOMPLETE", `latest event in block ${last} is above the finalized head ${ev.head.finalized}; a reorg could still change it`);
  } else {
    const depth = BigInt(ev.head.number) - last;
    if (depth >= BigInt(opts.confirmations)) c.add("finality", "PASS", `no finalized tag from this RPC; latest event is ${depth} blocks deep (threshold ${opts.confirmations})`);
    else c.add("finality", "INCOMPLETE", `latest event is only ${depth} blocks deep (threshold ${opts.confirmations})`);
  }
  return { events, version, expectedTag, supported: unknown.length === 0 };
}

/** Same fold as CommitReveal.foldReveal. */
export function foldReveal(previous: Hex, bidder: Address, amount: bigint, commitment: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [previous, bidder, amount, commitment],
    ),
  );
}

export const REVEAL_DIGEST_ALGORITHM =
  "d0 = bytes32(0); d(i) = keccak256(abi.encode(d(i-1), bidder, amount, commitment)), over reveals in (blockNumber, logIndex) order";

export function domainCommitment(tag: Hex, chainId: number, contract: Address, roundId: bigint, committer: Address, payload: Hex, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      [tag, BigInt(chainId), contract, roundId, committer, payload, salt],
    ),
  );
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32(bytes: Uint8Array): string {
  let out = "", bitCount = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bitCount += 8;
    while (bitCount >= 5) {
      out += B32[(value >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
    value &= (1 << bitCount) - 1;
  }
  if (bitCount > 0) out += B32[(value << (5 - bitCount)) & 31];
  return out;
}

/** CIDv1 (base32) for a sha2-256 digest. The chain stores only the digest, so the codec is unknown: both are listed. */
export function digestToCid(digest: Hex, codec: "raw" | "dag-pb"): string {
  const d = Buffer.from(digest.slice(2), "hex");
  return `b${base32(new Uint8Array([0x01, codec === "raw" ? 0x55 : 0x70, 0x12, 0x20, ...d]))}`;
}

export function documentRef(label: string, digest: Hex) {
  return { label, digest, cidRaw: digestToCid(digest, "raw"), cidDagPb: digestToCid(digest, "dag-pb") };
}

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

/** Largest file IPFS stores as one block by default; bigger files are chunked and cannot be rebuilt here. */
export const MAX_SINGLE_BLOCK = 256 * 1024;

/** Digests a file can have when stored as a single block: raw codec, or a one-block dag-pb UnixFS file. */
export function documentDigests(bytes: Uint8Array): { raw: Hex; dagPb: Hex } {
  const unixfs = [0x08, 0x02, 0x12, ...varint(bytes.length), ...bytes, 0x18, ...varint(bytes.length)];
  const node = new Uint8Array([0x0a, ...varint(unixfs.length), ...unixfs]);
  return { raw: sha256(bytes), dagPb: sha256(node) };
}

export function resultOf(checks: Check[], outcomeFinal: boolean): Result {
  if (checks.some((c) => c.status === "UNSUPPORTED")) return "UNSUPPORTED";
  if (checks.some((c) => c.status === "FAIL")) return "FAILED";
  if (!outcomeFinal || checks.some((c) => c.required && (c.status === "INCOMPLETE" || c.status === "NOT_CHECKED"))) return "INCOMPLETE";
  return "VERIFIED";
}

export const GENERATOR = { name: "plinths-fairness-verifier", version: "1.0.0" };

export function finish(partial: Omit<Report, "schemaVersion" | "generator" | "result" | "exitCode">): Report {
  const result = resultOf(partial.checks, partial.outcome.final);
  return { schemaVersion: "1.0.0", generator: GENERATOR, result, exitCode: EXIT_CODE[result], ...partial };
}

/** Fills the contract's immutable slots from the on-chain bytes, then compares everything else byte for byte. */
export function artifactMatcher(artifact: { deployedBytecode: { object: Hex; immutableReferences?: Record<string, { start: number; length: number }[]> } }, description: string): ExpectedCode {
  const local = artifact.deployedBytecode.object.slice(2).toLowerCase();
  const refs = Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat();
  return {
    source: "artifact",
    description,
    matches: (code) => {
      const chain = code.slice(2).toLowerCase();
      if (chain.length !== local.length) return { ok: false, note: `length ${chain.length / 2} vs ${local.length / 2} bytes` };
      let filled = local;
      const immutables = new Set<string>();
      for (const r of refs) {
        const value = chain.slice(r.start * 2, (r.start + r.length) * 2);
        filled = filled.slice(0, r.start * 2) + value + filled.slice((r.start + r.length) * 2);
        immutables.add(value);
      }
      return { ok: filled === chain, note: immutables.size ? `immutables read from chain: ${[...immutables].join(", ")}` : undefined };
    },
  };
}

export function evidenceSummary(ev: Evidence): Report["evidence"] {
  return { rpcCalls: ev.rpcCalls, logCount: ev.logs.length, fromBlock: ev.fromBlock, headBlock: ev.head.number, headTimestamp: ev.head.timestamp, finalizedBlock: ev.head.finalized };
}

/** Timing is enforced by the contract; block times are an extra check only where the RPC still serves them. */
export function timingCheck(c: Checks, ev: Evidence, rules: { label: string; block: string; test: (t: bigint) => boolean }[]) {
  const problems: string[] = [];
  let seen = 0;
  for (const r of rules) {
    const t = ev.blockTimes[r.block];
    if (t === undefined) continue;
    seen++;
    if (!r.test(BigInt(t))) problems.push(`${r.label} in block ${r.block} at time ${t}`);
  }
  if (problems.length) return c.add("timing", "FAIL", problems.join("; "), false);
  if (seen < rules.length) return c.add("timing", "NOT_CHECKED", `${rules.length - seen} of ${rules.length} block times unavailable; phase order then rests on the contract's own checks`, false);
  c.add("timing", "PASS", `all ${seen} events fall inside their phase by block time`, false);
}

export const sealedNotes = {
  amount: "Hidden until the bidder reveals: only a salted hash is on-chain. Public from the reveal onward, for ever. A bid never revealed stays hidden.",
  identity: "NOT hidden. The bidder's address is public from the first commitment, as are the time of the bid and any replacements.",
};
