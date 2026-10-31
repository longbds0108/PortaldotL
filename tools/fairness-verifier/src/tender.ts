import { encodeAbiParameters, keccak256, type Abi, type Address, type Hex } from "viem";
import { TENDER_ABI } from "./abi.js";
import {
  Checks, ZERO32, ZERO_ADDRESS, REVEAL_DIGEST_ALGORITHM, MAX_SINGLE_BLOCK,
  addr, bits, checkEnvelope, documentDigests, documentRef, domainCommitment, evidenceSummary, finish, foldReveal, lower, same, sealedNotes, timingCheck,
} from "./common.js";
import type { Evidence, Report, RevealEntry, VerifyOptions } from "./types.js";

function decodeTender(words: Hex[]) {
  const [w0, w1, w2, w3] = words.map(BigInt);
  return {
    buyer: addr(w0),
    submissionDeadline: bits(w0, 160, 64),
    bidCount: bits(w0, 224, 32),
    winner: addr(w1),
    revealDeadline: bits(w1, 160, 64),
    revealedCount: bits(w1, 224, 32),
    bidBond: bits(w2, 0, 96),
    cancelled: bits(w2, 160, 8) === 1n,
    awarded: bits(w2, 168, 8) === 1n,
    forfeitSwept: bits(w2, 176, 8) === 1n,
    budgetMin: w3 === undefined ? null : bits(w3, 0, 128),
    budgetMax: w3 === undefined ? null : bits(w3, 128, 128),
    revealSetDigest: (words[4] ?? null) as Hex | null,
  };
}

function decodeBid(pair: [Hex, Hex]) {
  const w1 = BigInt(pair[1]);
  return { commitment: pair[0], bond: bits(w1, 0, 96), amount: bits(w1, 96, 128), revealed: bits(w1, 224, 8) === 1n, bondWithdrawn: bits(w1, 232, 8) === 1n };
}

const RULE = {
  id: "plinths.tender.buyer-choice-within-budget",
  version: 1,
  deterministic: false,
  description:
    "The buyer picks any revealed bid; it need not be the cheapest. Logs can show the choice was allowed, not that it was the best one. V2 enforces the budget on-chain; on V1 this tool enforces it after the fact.",
};

const SEALING = {
  ...sealedNotes,
  proposal: "Encrypted in the browser; only ciphertext is on IPFS. The key is published at reveal, so a revealed proposal is readable by anyone, for ever. Size and upload time are not hidden.",
};

export function commitmentOf(version: 1 | 2, chainId: number, contract: Address, id: bigint, bidder: Address, amount: bigint, salt: Hex, docKey: Hex, tag: Hex): Hex {
  const keyHash = keccak256(docKey);
  if (version === 1) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }],
        [id, bidder, amount, salt, keyHash],
      ),
    );
  }
  const payload = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [amount, keyHash]));
  return domainCommitment(tag, chainId, contract, id, bidder, payload, salt);
}

export function verifyTender(ev: Evidence, opts: VerifyOptions): Report {
  const c = new Checks();
  const id = BigInt(ev.roundId);
  const { events, version, expectedTag, supported } = checkEnvelope(c, ev, opts, TENDER_ABI as unknown as Abi);

  const emptyReport = (status: string) =>
    finish({
      subject: { kind: "tender", roundId: ev.roundId, chainId: ev.chainId, contract: ev.contract, contractVersion: version, roundDocument: null },
      outcome: { status, final: false, winner: null, winningAmount: null, rule: RULE, randomness: { used: false, note: "Plinths tenders use no randomness." } },
      budget: null,
      revealSet: { algorithm: REVEAL_DIGEST_ALGORITHM, digest: ZERO32, onChainDigest: null, count: 0, entries: [], notRevealed: [] },
      references: [],
      documents: [],
      evidence: evidenceSummary(ev),
      sealing: SEALING,
      checks: c.list,
      limitations: ["Nothing could be established about this tender."],
    });

  if (!supported || !version) return emptyReport("UNKNOWN");
  if (id >= BigInt(ev.roundCount)) {
    c.add("round_exists", "FAIL", `contract holds ${ev.roundCount} tenders, there is no tender ${id}`);
    return emptyReport("NOT_FOUND");
  }
  const t = decodeTender(ev.words);
  const ofTender = events.filter((e) => BigInt(e.args.tenderId) === id);
  if (ofTender.length !== events.length) c.add("log_scope", "FAIL", `${events.length - ofTender.length} log(s) belong to another tender`);

  // ── creation ──
  const createdLogs = ofTender.filter((e) => e.name === "TenderCreated");
  if (createdLogs.length === 0) {
    c.add("round_exists", "INCOMPLETE", "storage has this tender but TenderCreated was not returned; widen --from-block or try another RPC");
    return emptyReport("UNKNOWN");
  }
  if (createdLogs.length > 1) c.add("round_exists", "FAIL", `${createdLogs.length} TenderCreated logs`);
  const created = createdLogs[0];
  const a = created.args as unknown as { buyer: Address; metadata: Hex; budgetMin: bigint; budgetMax: bigint; submissionDeadline: bigint; revealDeadline: bigint; bidBond: bigint };
  const createProblems: string[] = [];
  if (!same(a.buyer, t.buyer)) createProblems.push(`buyer: log ${a.buyer}, storage ${t.buyer}`);
  if (a.submissionDeadline !== t.submissionDeadline) createProblems.push("submission deadline differs from storage");
  if (a.revealDeadline !== t.revealDeadline) createProblems.push("reveal deadline differs from storage");
  if (a.bidBond !== t.bidBond) createProblems.push("bond differs from storage");
  if (a.budgetMin > a.budgetMax) createProblems.push("budget minimum above maximum");
  if (a.revealDeadline < a.submissionDeadline + 86_400n) createProblems.push("reveal window under 24 hours");
  if (version === 2 && (t.budgetMin !== a.budgetMin || t.budgetMax !== a.budgetMax)) createProblems.push("budget differs from storage");
  c.all("round_exists", createProblems, `TenderCreated agrees with storage: buyer ${t.buyer}`);

  // ── the bids, in chain order ──
  const lastCommit = new Map<string, Hex>();
  const bidders = new Map<string, Address>();
  const reveals: RevealEntry[] = [];
  const phaseProblems: string[] = [];
  const openingProblems: string[] = [];
  let firstBids = 0n;
  let digest = ZERO32;
  const timing: { label: string; block: string; test: (x: bigint) => boolean }[] = [];
  let awardSeen = false;
  const refs: Report["references"] = [{ label: "TenderCreated", txHash: created.log.transactionHash, blockNumber: created.log.blockNumber }];

  for (const e of ofTender) {
    const b = e.args as unknown as { bidder: Address; commitment: Hex; first: boolean; amount: bigint; salt: Hex; docKey: Hex };
    if (BigInt(e.log.blockNumber) < BigInt(created.log.blockNumber)) phaseProblems.push(`${e.name} before TenderCreated`);
    if (e.name === "BidSubmitted") {
      if (reveals.length) phaseProblems.push(`bid by ${b.bidder} after a reveal`);
      if (awardSeen) phaseProblems.push(`bid by ${b.bidder} after the award`);
      if (b.first) {
        firstBids++;
        if (bidders.has(lower(b.bidder))) phaseProblems.push(`second first-bid from ${b.bidder}`);
      } else if (!bidders.has(lower(b.bidder))) {
        phaseProblems.push(`replacement from ${b.bidder} with no first bid`);
      }
      if (same(b.bidder, t.buyer)) phaseProblems.push("the buyer bid on their own tender");
      bidders.set(lower(b.bidder), b.bidder);
      lastCommit.set(lower(b.bidder), b.commitment);
      refs.push({ label: b.first ? "BidSubmitted" : "BidReplaced", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "bid after the submission deadline", block: e.log.blockNumber, test: (x) => x < t.submissionDeadline });
    } else if (e.name === "BidRevealed") {
      if (awardSeen) phaseProblems.push(`reveal by ${b.bidder} after the award`);
      const sealed = lastCommit.get(lower(b.bidder));
      if (reveals.some((r) => same(r.bidder, b.bidder))) phaseProblems.push(`second reveal from ${b.bidder}`);
      if (!sealed) {
        openingProblems.push(`reveal by ${b.bidder} with no commitment in the logs`);
      } else {
        const expected = commitmentOf(version, ev.chainId, ev.contract, id, b.bidder, b.amount, b.salt, b.docKey, expectedTag);
        if (!same(expected, sealed)) openingProblems.push(`${b.bidder}: amount, salt and key do not hash to the sealed commitment`);
        digest = foldReveal(digest, b.bidder, b.amount, sealed);
        reveals.push({ bidder: b.bidder, amount: b.amount.toString(), commitment: sealed, blockNumber: e.log.blockNumber, logIndex: e.log.logIndex, txHash: e.log.transactionHash });
      }
      refs.push({ label: "BidRevealed", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "reveal outside the reveal window", block: e.log.blockNumber, test: (x) => x >= t.submissionDeadline && x < t.revealDeadline });
    } else if (e.name === "TenderAwarded") {
      awardSeen = true;
      refs.push({ label: "TenderAwarded", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "award before the reveal deadline", block: e.log.blockNumber, test: (x) => x >= t.revealDeadline });
    } else if (e.name === "ForfeitedBondsSwept") {
      refs.push({ label: "ForfeitedBondsSwept", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "sweep before the reveal deadline", block: e.log.blockNumber, test: (x) => x >= t.revealDeadline });
    } else if (e.name === "BondWithdrawn") {
      refs.push({ label: "BondWithdrawn", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
    } else if (e.name === "TenderCancelled") {
      refs.push({ label: "TenderCancelled", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "cancel after the submission deadline", block: e.log.blockNumber, test: (x) => x < t.submissionDeadline });
    }
  }
  c.all("phase_order", phaseProblems, "bids, reveals and the award appear in a legal order");
  c.all("commitment_openings", openingProblems, reveals.length ? `all ${reveals.length} reveals open their sealed commitment` : "no reveals to check");
  timingCheck(c, ev, timing);

  // ── logs against storage: a shorter log list than storage implies is missing data, not proof of fraud ──
  const countStatus = (label: string, inLogs: bigint, inStorage: bigint) => {
    if (inLogs === inStorage) c.add(`${label}_count`, "PASS", `${inLogs} in logs, ${inStorage} in storage`);
    else if (inLogs < inStorage) c.add(`${label}_count`, "INCOMPLETE", `storage counts ${inStorage} but only ${inLogs} log(s) were returned: logs are missing`);
    else c.add(`${label}_count`, "FAIL", `${inLogs} logs but storage counts ${inStorage}`);
  };
  countStatus("bid", firstBids, t.bidCount);
  countStatus("reveal", BigInt(reveals.length), t.revealedCount);

  const storageProblems: string[] = [];
  for (const [key, who] of bidders) {
    const pair = ev.bids[key];
    if (!pair) {
      storageProblems.push(`no storage read for ${who}`);
      continue;
    }
    const s = decodeBid(pair);
    if (!same(s.commitment, lastCommit.get(key))) storageProblems.push(`${who}: stored commitment differs from the latest log`);
    const r = reveals.find((x) => same(x.bidder, who));
    if (s.revealed !== !!r) storageProblems.push(`${who}: revealed flag disagrees with the logs`);
    if (r && s.amount.toString() !== r.amount) storageProblems.push(`${who}: stored amount differs from the reveal log`);
    if (!r && s.amount !== 0n) storageProblems.push(`${who}: an amount is stored without a reveal`);
    if (s.bond !== t.bidBond) storageProblems.push(`${who}: bond ${s.bond} differs from the tender's ${t.bidBond}`);
  }
  c.all("bid_storage", storageProblems, `${bidders.size} bid(s) agree with storage`);

  // ── award ──
  const awards = ofTender.filter((e) => e.name === "TenderAwarded");
  const budget = { min: a.budgetMin.toString(), max: a.budgetMax.toString() };
  const documents = [documentRef("Tender metadata", a.metadata)];
  let winner: Address | null = null;
  let winningAmount: bigint | null = null;
  if (awards.length > 1) c.add("award", "FAIL", `${awards.length} TenderAwarded logs`);
  if (t.awarded && awards.length === 0) c.add("award", "INCOMPLETE", "storage says awarded but TenderAwarded was not returned");
  if (!t.awarded && awards.length > 0) c.add("award", "FAIL", "a TenderAwarded log exists but storage says not awarded");
  if (t.awarded && awards.length === 1) {
    const w = awards[0].args as unknown as { winner: Address; amount: bigint; reason: Hex };
    winner = w.winner;
    winningAmount = w.amount;
    documents.push(documentRef("Award reason", w.reason));
    const problems: string[] = [];
    if (!same(w.winner, t.winner)) problems.push(`winner: log ${w.winner}, storage ${t.winner}`);
    const r = reveals.find((x) => same(x.bidder, w.winner));
    if (!r) problems.push(`winner ${w.winner} has no valid reveal`);
    else if (r.amount !== w.amount.toString()) problems.push(`award states ${w.amount}, the bid revealed ${r.amount}`);
    if (w.reason === ZERO32) problems.push("empty reason document");
    const sender = ev.txSenders[awards[0].log.transactionHash];
    if (sender && !same(sender, t.buyer)) problems.push(`award sent by ${sender}, not the buyer`);
    c.all("award", problems, `${w.winner} was revealed, and the amount and storage agree${sender ? "; sent by the buyer" : ""}`);
    if (!sender) c.add("award_sender", "NOT_CHECKED", "transaction no longer served; the contract's own check is relied on", false);

    if (w.amount < a.budgetMin || w.amount > a.budgetMax) {
      c.add("budget", "FAIL", `winning amount ${w.amount} is outside the published budget ${a.budgetMin}..${a.budgetMax}`);
    } else {
      c.add("budget", "PASS", "winning amount is inside the published budget");
    }

    if (version === 2) {
      const sel = ofTender.filter((e) => e.name === "SelectionRecorded");
      if (sel.length !== 1) {
        c.add("selection_record", sel.length ? "FAIL" : "INCOMPLETE", `${sel.length} SelectionRecorded logs, expected 1`);
      } else {
        const s = sel[0].args as unknown as { winner: Address; revealSetDigest: Hex; revealedCount: number; rule: number };
        const p: string[] = [];
        if (!same(s.winner, w.winner)) p.push("names a different winner");
        if (!same(s.revealSetDigest, digest)) p.push(`digest ${s.revealSetDigest}, recomputed ${digest}`);
        if (BigInt(s.revealedCount) !== t.revealedCount) p.push("revealed count differs");
        if (s.rule !== RULE.version) p.push(`unknown selection rule ${s.rule}`);
        c.all("selection_record", p, "SelectionRecorded matches the recomputed reveal-set digest");
      }
    }
  }
  if (version === 2 && !same(t.revealSetDigest, digest)) {
    if (BigInt(reveals.length) < t.revealedCount) c.add("reveal_digest", "INCOMPLETE", "digest cannot be recomputed with reveal logs missing");
    else c.add("reveal_digest", "FAIL", `stored digest ${t.revealSetDigest}, recomputed ${digest}`);
  } else if (version === 2) {
    c.add("reveal_digest", "PASS", "the digest the contract built during reveals equals the one recomputed from logs");
  } else {
    c.add("reveal_digest", "NOT_CHECKED", "V1 keeps no digest on-chain; the one in this report is computed from logs only", false);
  }

  // ── award reason document ──
  if (winner && documents[1] && opts.reasonDocument) {
    const digests = documentDigests(opts.reasonDocument);
    const onChain = documents[1].digest;
    if (same(digests.raw, onChain) || same(digests.dagPb, onChain)) {
      let parsed: { tenderId?: unknown; winner?: unknown } = {};
      try {
        parsed = JSON.parse(new TextDecoder().decode(opts.reasonDocument)) as typeof parsed;
      } catch {
        // an unparsable document fails the checks below
      }
      const p: string[] = [];
      if (parsed.tenderId !== id.toString()) p.push(`document is about tender ${String(parsed.tenderId)}`);
      if (!same(String(parsed.winner), winner)) p.push(`document names ${String(parsed.winner)}`);
      c.all("reason_document", p, "the supplied document hashes to the on-chain digest and names this tender and winner", false);
    } else if (opts.reasonDocument.length > MAX_SINGLE_BLOCK) {
      c.add("reason_document", "NOT_CHECKED", "file too large for this tool to rebuild its chunked IPFS digest", false);
    } else {
      c.add("reason_document", "FAIL", "the supplied document does not hash to the on-chain digest", false);
    }
  } else if (winner) {
    c.add("reason_document", "NOT_CHECKED", "no document supplied (--reason-file); its text is not covered by this report", false);
  }

  // ── bonds ──
  const bondProblems: string[] = [];
  const withdrawn = new Set<string>();
  for (const e of ofTender.filter((x) => x.name === "BondWithdrawn")) {
    const b = e.args as unknown as { bidder: Address; amount: bigint };
    if (withdrawn.has(lower(b.bidder))) bondProblems.push(`${b.bidder} withdrew twice`);
    withdrawn.add(lower(b.bidder));
    if (!reveals.some((r) => same(r.bidder, b.bidder))) bondProblems.push(`${b.bidder} withdrew without revealing`);
    if (b.amount !== t.bidBond) bondProblems.push(`${b.bidder} withdrew ${b.amount}, the bond is ${t.bidBond}`);
  }
  const sweeps = ofTender.filter((x) => x.name === "ForfeitedBondsSwept");
  if (sweeps.length > 1) bondProblems.push(`${sweeps.length} sweeps`);
  if (sweeps.length === 1) {
    const expected = t.bidBond * (t.bidCount - t.revealedCount);
    const got = (sweeps[0].args as unknown as { amount: bigint }).amount;
    if (got !== expected) bondProblems.push(`swept ${got}, forfeited bonds total ${expected}`);
  }
  if (t.forfeitSwept !== sweeps.length > 0) bondProblems.push("sweep flag disagrees with the logs");
  c.all("bonds", bondProblems, "bond withdrawals and sweeps follow the rules", true);

  // ── outcome ──
  const now = BigInt(ev.head.timestamp);
  let status: string;
  let final = true;
  if (t.cancelled) status = "CANCELLED";
  else if (t.awarded) status = "AWARDED";
  else if (now < t.submissionDeadline) (status = "OPEN"), (final = false);
  else if (now < t.revealDeadline) (status = "REVEAL"), (final = false);
  else if (t.revealedCount === 0n) status = "NO_VALID_BIDS";
  else (status = "EVALUATION"), (final = false);

  const notRevealed = [...bidders.values()].filter((b) => !reveals.some((r) => same(r.bidder, b)));
  const limitations = [
    "This report covers procedure, not merit: the buyer's choice among allowed bids is a judgement that logs cannot prove right or wrong.",
    "Identity is an address. Logs cannot show that two addresses are unrelated, so collusion or a buyer bidding through another account stays invisible.",
    "Evidence comes from one RPC endpoint. A dishonest RPC could serve false data; compare another endpoint or your own node where one exists.",
    "Eligibility requirements live in the off-chain tender metadata and are not checked.",
  ];
  if (version === 1) limitations.push("V1 contract: commitments are not bound to a chain or contract, and award() does not enforce the budget (docs/issues/ISSUE-001, ISSUE-002).");
  if (notRevealed.length) limitations.push("Bids never revealed stay sealed. Nobody can tell what they offered or why they were withheld.");
  if (t.bidCount > t.revealedCount && t.bidBond > 0n && !t.forfeitSwept && now >= t.revealDeadline) {
    limitations.push(`Forfeited bonds of ${t.bidBond * (t.bidCount - t.revealedCount)} wei have not been swept to the treasury yet.`);
  }
  if (ev.head.finalized === null) limitations.push("This RPC reports no finalized block, so finality is judged by depth only.");

  return finish({
    subject: { kind: "tender", roundId: ev.roundId, chainId: ev.chainId, contract: ev.contract, contractVersion: version, roundDocument: a.metadata },
    outcome: {
      status,
      final,
      winner: winner && winner !== ZERO_ADDRESS ? winner : null,
      winningAmount: winningAmount?.toString() ?? null,
      rule: RULE,
      randomness: { used: false, note: "Plinths tenders use no randomness." },
    },
    budget,
    revealSet: { algorithm: REVEAL_DIGEST_ALGORITHM, digest, onChainDigest: version === 2 ? t.revealSetDigest : null, count: reveals.length, entries: reveals, notRevealed },
    references: refs,
    documents,
    evidence: evidenceSummary(ev),
    sealing: SEALING,
    checks: c.list,
    limitations,
  });
}
