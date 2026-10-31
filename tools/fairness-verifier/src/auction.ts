import { decodeEventLog, encodeAbiParameters, keccak256, type Abi, type Address, type Hex } from "viem";
import { AUCTION_ABI, ERC721_ABI } from "./abi.js";
import {
  Checks, ZERO32, ZERO_ADDRESS, REVEAL_DIGEST_ALGORITHM,
  addr, bits, checkEnvelope, documentRef, domainCommitment, evidenceSummary, finish, foldReveal, lower, same, sealedNotes, timingCheck,
} from "./common.js";
import type { Evidence, Report, RevealEntry, VerifyOptions } from "./types.js";

function decodeAuction(words: Hex[]) {
  const [w0, w1, w2, w3, w4] = words.map(BigInt);
  return {
    seller: addr(w0),
    bidDeadline: bits(w0, 160, 64),
    bidCount: bits(w0, 224, 32),
    collection: addr(w1),
    revealDeadline: bits(w1, 160, 64),
    revealedCount: bits(w1, 224, 32),
    tokenId: w2,
    highestBidder: addr(w3),
    settled: bits(w3, 224, 8) === 1n,
    cancelled: bits(w3, 232, 8) === 1n,
    proceedsPaid: bits(w3, 240, 8) === 1n,
    reservePrice: bits(w4, 0, 128),
    highestBid: bits(w4, 128, 128),
  };
}

function decodeBid(pair: [Hex, Hex]) {
  const w1 = BigInt(pair[1]);
  return { commitment: pair[0], deposit: bits(w1, 0, 112), amount: bits(w1, 112, 112), revealed: bits(w1, 224, 8) === 1n, withdrawn: bits(w1, 232, 8) === 1n };
}

const RULE = {
  id: "plinths.auction.highest-counted-first-reveal",
  version: 1,
  deterministic: true,
  description:
    "Highest revealed amount that is at least the reserve and at most the bidder's deposit. On a tie the earlier reveal keeps the lead. The winner pays their own price. Recomputed here from logs alone.",
};

const SEALING = {
  ...sealedNotes,
  amount: `${sealedNotes.amount} The public deposit is an upper bound on any bid that can count.`,
  proposal: "Not applicable: auctions have no proposal document.",
};

export function auctionCommitmentOf(version: 1 | 2, chainId: number, contract: Address, id: bigint, bidder: Address, amount: bigint, salt: Hex, tag: Hex): Hex {
  if (version === 1) {
    return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }], [id, bidder, amount, salt]));
  }
  const payload = keccak256(encodeAbiParameters([{ type: "uint256" }], [amount]));
  return domainCommitment(tag, chainId, contract, id, bidder, payload, salt);
}

export function verifyAuction(ev: Evidence, opts: VerifyOptions): Report {
  const c = new Checks();
  const id = BigInt(ev.roundId);
  const { events, version, expectedTag, supported } = checkEnvelope(c, ev, opts, AUCTION_ABI as unknown as Abi);

  const emptyReport = (status: string) =>
    finish({
      subject: { kind: "auction", roundId: ev.roundId, chainId: ev.chainId, contract: ev.contract, contractVersion: version, roundDocument: null },
      outcome: { status, final: false, winner: null, winningAmount: null, rule: RULE, randomness: { used: false, note: "Plinths auctions use no randomness." } },
      budget: null,
      revealSet: { algorithm: REVEAL_DIGEST_ALGORITHM, digest: ZERO32, onChainDigest: null, count: 0, entries: [], notRevealed: [] },
      references: [],
      documents: [],
      evidence: evidenceSummary(ev),
      sealing: SEALING,
      checks: c.list,
      limitations: ["Nothing could be established about this auction."],
    });

  if (!supported || !version) return emptyReport("UNKNOWN");
  if (id >= BigInt(ev.roundCount)) {
    c.add("round_exists", "FAIL", `contract holds ${ev.roundCount} auctions, there is no auction ${id}`);
    return emptyReport("NOT_FOUND");
  }
  const s = decodeAuction(ev.words);
  const own = events.filter((e) => BigInt(e.args.auctionId) === id);
  if (own.length !== events.length) c.add("log_scope", "FAIL", `${events.length - own.length} log(s) belong to another auction`);

  const createdLogs = own.filter((e) => e.name === "AuctionCreated");
  if (createdLogs.length === 0) {
    c.add("round_exists", "INCOMPLETE", "storage has this auction but AuctionCreated was not returned; widen --from-block or try another RPC");
    return emptyReport("UNKNOWN");
  }
  const created = createdLogs[0];
  const a = created.args as unknown as { seller: Address; collection: Address; tokenId: bigint; reservePrice: bigint; bidDeadline: bigint; revealDeadline: bigint };
  const createProblems: string[] = [];
  if (createdLogs.length > 1) createProblems.push(`${createdLogs.length} AuctionCreated logs`);
  if (!same(a.seller, s.seller)) createProblems.push("seller differs from storage");
  if (!same(a.collection, s.collection)) createProblems.push("collection differs from storage");
  if (a.tokenId !== s.tokenId) createProblems.push("token differs from storage");
  if (a.reservePrice !== s.reservePrice) createProblems.push("reserve differs from storage");
  if (a.bidDeadline !== s.bidDeadline || a.revealDeadline !== s.revealDeadline) createProblems.push("deadlines differ from storage");
  if (a.revealDeadline < a.bidDeadline + 86_400n) createProblems.push("reveal window under 24 hours");
  c.all("round_exists", createProblems, `AuctionCreated agrees with storage: token ${s.tokenId} of ${s.collection}`);

  // ── replay every bid and reveal; the winner must come out of this, not out of the contract's word ──
  const commits = new Map<string, Hex>();
  const deposits = new Map<string, bigint>();
  const bidders = new Map<string, Address>();
  const reveals: RevealEntry[] = [];
  const phaseProblems: string[] = [];
  const openingProblems: string[] = [];
  const replayProblems: string[] = [];
  const timing: { label: string; block: string; test: (x: bigint) => boolean }[] = [];
  const refs: Report["references"] = [{ label: "AuctionCreated", txHash: created.log.transactionHash, blockNumber: created.log.blockNumber }];
  let firstBids = 0n;
  let digest = ZERO32;
  let best = 0n;
  let bestBidder: Address = ZERO_ADDRESS;
  let settleSeen = false;

  for (const e of own) {
    const b = e.args as unknown as { bidder: Address; commitment: Hex; deposit: bigint; first: boolean; amount: bigint; salt: Hex; counted: boolean };
    if (BigInt(e.log.blockNumber) < BigInt(created.log.blockNumber)) phaseProblems.push(`${e.name} before AuctionCreated`);
    if (e.name === "BidPlaced") {
      if (reveals.length) phaseProblems.push(`bid by ${b.bidder} after a reveal`);
      if (b.first) firstBids++;
      if (same(b.bidder, s.seller)) phaseProblems.push("the seller bid on their own auction");
      if (b.deposit < (deposits.get(lower(b.bidder)) ?? 0n)) phaseProblems.push(`${b.bidder}: deposit went down`);
      bidders.set(lower(b.bidder), b.bidder);
      commits.set(lower(b.bidder), b.commitment);
      deposits.set(lower(b.bidder), b.deposit);
      refs.push({ label: b.first ? "BidPlaced" : "BidReplaced", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "bid after the bid deadline", block: e.log.blockNumber, test: (x) => x < s.bidDeadline });
    } else if (e.name === "BidRevealed") {
      if (settleSeen) phaseProblems.push(`reveal by ${b.bidder} after settlement`);
      if (reveals.some((r) => same(r.bidder, b.bidder))) phaseProblems.push(`second reveal from ${b.bidder}`);
      const sealed = commits.get(lower(b.bidder));
      if (!sealed) {
        openingProblems.push(`reveal by ${b.bidder} with no commitment in the logs`);
      } else {
        const expected = auctionCommitmentOf(version, ev.chainId, ev.contract, id, b.bidder, b.amount, b.salt, expectedTag);
        if (!same(expected, sealed)) openingProblems.push(`${b.bidder}: amount and salt do not hash to the sealed commitment`);
        const counted = b.amount >= s.reservePrice && b.amount <= (deposits.get(lower(b.bidder)) ?? 0n) && b.amount > best;
        if (counted !== b.counted) replayProblems.push(`${b.bidder}: replay says counted=${counted}, log says ${b.counted}`);
        if (counted) {
          best = b.amount;
          bestBidder = b.bidder;
        }
        digest = foldReveal(digest, b.bidder, b.amount, sealed);
        reveals.push({ bidder: b.bidder, amount: b.amount.toString(), commitment: sealed, counted, blockNumber: e.log.blockNumber, logIndex: e.log.logIndex, txHash: e.log.transactionHash });
      }
      refs.push({ label: "BidRevealed", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "reveal outside the reveal window", block: e.log.blockNumber, test: (x) => x >= s.bidDeadline && x < s.revealDeadline });
    } else if (e.name === "AuctionSettled") {
      settleSeen = true;
      refs.push({ label: "AuctionSettled", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "settlement before the reveal deadline", block: e.log.blockNumber, test: (x) => x >= s.revealDeadline });
    } else if (e.name === "Withdrawn") {
      refs.push({ label: "Withdrawn", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
    } else if (e.name === "AuctionCancelled") {
      refs.push({ label: "AuctionCancelled", txHash: e.log.transactionHash, blockNumber: e.log.blockNumber });
      timing.push({ label: "cancel after the bid deadline", block: e.log.blockNumber, test: (x) => x < s.bidDeadline });
    }
  }
  c.all("phase_order", phaseProblems, "bids, reveals and settlement appear in a legal order");
  c.all("commitment_openings", openingProblems, reveals.length ? `all ${reveals.length} reveals open their sealed commitment` : "no reveals to check");
  timingCheck(c, ev, timing);

  const countStatus = (label: string, inLogs: bigint, inStorage: bigint) => {
    if (inLogs === inStorage) c.add(`${label}_count`, "PASS", `${inLogs} in logs, ${inStorage} in storage`);
    else if (inLogs < inStorage) c.add(`${label}_count`, "INCOMPLETE", `storage counts ${inStorage} but only ${inLogs} log(s) were returned: logs are missing`);
    else c.add(`${label}_count`, "FAIL", `${inLogs} logs but storage counts ${inStorage}`);
  };
  countStatus("bid", firstBids, s.bidCount);
  countStatus("reveal", BigInt(reveals.length), s.revealedCount);

  const logsComplete = firstBids === s.bidCount && BigInt(reveals.length) === s.revealedCount;
  if (logsComplete) {
    if (!same(bestBidder, s.highestBidder)) replayProblems.push(`replay picks ${bestBidder}, storage has ${s.highestBidder}`);
    if (best !== s.highestBid) replayProblems.push(`replay price ${best}, storage has ${s.highestBid}`);
    c.all("winner_recomputed", replayProblems, best ? `replaying the reveals gives ${bestBidder} at ${best}, same as the contract` : "replaying the reveals gives no valid bid, same as the contract");
  } else {
    c.add("winner_recomputed", replayProblems.length ? "FAIL" : "INCOMPLETE", replayProblems.join("; ") || "cannot replay with logs missing");
  }

  const storageProblems: string[] = [];
  for (const [key, who] of bidders) {
    const pair = ev.bids[key];
    if (!pair) {
      storageProblems.push(`no storage read for ${who}`);
      continue;
    }
    const b = decodeBid(pair);
    if (!same(b.commitment, commits.get(key))) storageProblems.push(`${who}: stored commitment differs from the latest log`);
    if (b.deposit !== deposits.get(key)) storageProblems.push(`${who}: stored deposit differs from the latest log`);
    const r = reveals.find((x) => same(x.bidder, who));
    if (b.revealed !== !!r) storageProblems.push(`${who}: revealed flag disagrees with the logs`);
    if (r && b.amount.toString() !== r.amount) storageProblems.push(`${who}: stored amount differs from the reveal log`);
  }
  c.all("bid_storage", storageProblems, `${bidders.size} bid(s) agree with storage`);

  // ── settlement and NFT custody ──
  const settles = own.filter((e) => e.name === "AuctionSettled");
  const settleProblems: string[] = [];
  if (settles.length > 1) settleProblems.push(`${settles.length} AuctionSettled logs`);
  if (settles.length > 0 && !s.settled) settleProblems.push("a settlement log exists but storage says not settled");
  if (settles.length === 1) {
    const x = settles[0].args as unknown as { winner: Address; amount: bigint };
    if (!same(x.winner, s.highestBidder)) settleProblems.push(`settlement names ${x.winner}, storage ${s.highestBidder}`);
    if (x.amount !== s.highestBid) settleProblems.push(`settlement price ${x.amount}, storage ${s.highestBid}`);
  }
  if (s.settled && settles.length === 0) c.add("settlement", "INCOMPLETE", "storage says settled but AuctionSettled was not returned");
  else c.all("settlement", settleProblems, s.settled ? "AuctionSettled agrees with storage" : "not settled yet");

  const expectedTo = s.highestBidder !== ZERO_ADDRESS ? s.highestBidder : s.seller;
  if (s.settled && settles.length === 1) {
    const receipt = ev.settleReceiptLogs;
    if (!receipt) {
      c.add("nft_delivery", "NOT_CHECKED", "settlement receipt not served; delivery rests on the contract's call succeeding", false);
    } else {
      let delivered = false;
      for (const l of receipt) {
        if (!same(l.address, s.collection)) continue;
        try {
          const d = decodeEventLog({ abi: ERC721_ABI, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
          const t = d.args as { from?: Address; to?: Address; tokenId?: bigint };
          if (d.eventName === "Transfer" && same(t.from, ev.contract) && same(t.to, expectedTo) && t.tokenId === s.tokenId) delivered = true;
        } catch {
          // another event of the collection
        }
      }
      c.add("nft_delivery", delivered ? "PASS" : "FAIL", delivered ? `settlement transaction moved token ${s.tokenId} to ${expectedTo}` : `no Transfer of token ${s.tokenId} to ${expectedTo} in the settlement transaction`);
    }
  } else if (!s.settled && !s.cancelled) {
    if (ev.nftOwner === undefined || ev.nftOwner === null) c.add("nft_custody", "NOT_CHECKED", "ownerOf could not be read", false);
    else c.add("nft_custody", same(ev.nftOwner, ev.contract) ? "PASS" : "FAIL", same(ev.nftOwner, ev.contract) ? `the auction holds token ${s.tokenId}` : `token ${s.tokenId} is held by ${ev.nftOwner}, not the auction`);
  }

  // ── payouts ──
  const payProblems: string[] = [];
  const paid = new Set<string>();
  for (const e of own.filter((x) => x.name === "Withdrawn")) {
    const w = e.args as unknown as { account: Address; amount: bigint };
    const key = lower(w.account);
    if (paid.has(key)) payProblems.push(`${w.account} withdrew twice`);
    paid.add(key);
    if (same(w.account, s.seller)) {
      if (w.amount !== s.highestBid) payProblems.push(`seller got ${w.amount}, the price is ${s.highestBid}`);
      continue;
    }
    const deposit = deposits.get(key);
    if (deposit === undefined) {
      payProblems.push(`${w.account} withdrew with no bid`);
      continue;
    }
    const r = reveals.find((x) => same(x.bidder, w.account));
    const expected = !r ? deposit - (deposit * 1000n) / 10_000n : same(w.account, s.highestBidder) ? deposit - s.highestBid : deposit;
    if (w.amount !== expected) payProblems.push(`${w.account} got ${w.amount}, the rules give ${expected}`);
  }
  c.all("payouts", payProblems, "every withdrawal matches the payment rules");

  const now = BigInt(ev.head.timestamp);
  let status: string;
  let final = true;
  if (s.cancelled) status = "CANCELLED";
  else if (s.settled) status = s.highestBidder === ZERO_ADDRESS ? "NO_SALE" : "SOLD";
  else if (now < s.bidDeadline) (status = "OPEN"), (final = false);
  else if (now < s.revealDeadline) (status = "REVEAL"), (final = false);
  else (status = s.highestBidder === ZERO_ADDRESS ? "NO_SALE_AWAITING_SETTLE" : "AWAITING_SETTLE"), (final = false);

  const notRevealed = [...bidders.values()].filter((b) => !reveals.some((r) => same(r.bidder, b)));
  const limitations = [
    "A bidder who sees rivals' reveals can still withhold their own, at a cost of 10% of the deposit. Two addresses run by one person can use this to place a bid only if it is needed.",
    "The collection is whatever contract listed the token. This tool checks transfers it reports, not that the collection is honest or the artwork genuine.",
    "Evidence comes from one RPC endpoint. A dishonest RPC could serve false data; compare another endpoint or your own node where one exists.",
  ];
  if (version === 1) limitations.push("V1 contract: commitments are not bound to a chain or contract, and listings are not checked for custody (docs/issues/ISSUE-002, ISSUE-003).");
  if (ev.head.finalized === null) limitations.push("This RPC reports no finalized block, so finality is judged by depth only.");

  return finish({
    subject: { kind: "auction", roundId: ev.roundId, chainId: ev.chainId, contract: ev.contract, contractVersion: version, roundDocument: null },
    outcome: {
      status,
      final,
      winner: s.settled && s.highestBidder !== ZERO_ADDRESS ? s.highestBidder : null,
      winningAmount: s.settled && s.highestBidder !== ZERO_ADDRESS ? s.highestBid.toString() : null,
      rule: RULE,
      randomness: { used: false, note: "Plinths auctions use no randomness." },
    },
    budget: null,
    revealSet: { algorithm: REVEAL_DIGEST_ALGORITHM, digest, onChainDigest: null, count: reveals.length, entries: reveals, notRevealed },
    references: refs,
    documents: [] as ReturnType<typeof documentRef>[],
    evidence: evidenceSummary(ev),
    sealing: SEALING,
    checks: c.list,
    limitations,
  });
}
