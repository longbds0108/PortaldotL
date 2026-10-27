import type { Address, Hash } from "viem";
import { TenderState } from "./contracts";
import { DisputeStatus, TargetKind, reasonOf, type DisputeCore } from "./disputes";
import { actorsOf, type ChainEvent, type MarketSnapshot } from "./market-data";
import { tenderState } from "./market-storage";
import type { Text } from "./i18n";
import { AuctionState } from "./nft-auction";
import { auctionState } from "./nft-storage";

/*
 * Reputation = how a wallet behaved on Plinths, from verifiable on-chain history only. It is not a moral or
 * real-world trust rating. Every score change is a ledger entry with its reason and the transaction behind it, and
 * the rules below are published in the app, so anyone can recompute a score.
 */

export const BASE_SCORE = 50;
/** Same threshold as the buyer history on tender pages (lib/hooks.ts STALLED_AFTER_S). */
const STALLED_AFTER_S = 7 * 24 * 60 * 60;

/** The published rules. Positive = completed obligations; negative = obligations not met. */
export const RULES = {
  revealed: { points: 3, text: ["Revealed a sealed bid in time", "Công bố giá niêm phong đúng hạn"] },
  missedReveal: { points: -8, text: ["Did not reveal a sealed bid before the deadline", "Không công bố giá niêm phong trước hạn"] },
  wonTender: { points: 5, text: ["Won a tender", "Trúng một gói thầu"] },
  wonAuction: { points: 3, text: ["Won an NFT auction", "Thắng một phiên đấu giá NFT"] },
  awarded: { points: 6, text: ["Completed a tender with an award", "Hoàn tất gói thầu bằng quyết định trao thầu"] },
  overdueAward: {
    points: -4,
    text: [
      `Left a tender unawarded for over ${STALLED_AFTER_S / 86_400} days after reveals`,
      `Để gói thầu quá ${STALLED_AFTER_S / 86_400} ngày sau công bố mà chưa trao thầu`,
    ],
  },
  cancelledTender: { points: -1, text: ["Cancelled a tender (before any bid)", "Hủy gói thầu (trước khi có hồ sơ)"] },
  sold: { points: 4, text: ["Completed an NFT sale (settled)", "Hoàn tất bán NFT (đã kết thúc)"] },
  cancelledAuction: { points: -1, text: ["Cancelled an NFT auction (before any bid)", "Hủy phiên đấu giá NFT (trước khi có giá)"] },
  disputeUpheldAgainst: { points: -10, text: ["A dispute about their tender or auction was upheld", "Một khiếu nại về gói thầu hoặc phiên đấu giá của họ được chấp nhận"] },
  disputeUpheldOpened: { points: 2, text: ["Raised a concern that was upheld", "Nêu một khiếu nại được chấp nhận"] },
} as const satisfies Record<string, { points: number; text: Text }>;
export type RuleKey = keyof typeof RULES;

export type LedgerEntry = { rule: RuleKey; points: number; time: number; txHash?: Hash; ref: Text; scoreAfter: number };

export type Badge = { key: string; label: Text; detail: Text };

export type Profile = {
  address: Address;
  score: number;
  level: "New" | "Building" | "Reliable" | "Trusted" | "At risk";
  ledger: LedgerEntry[];
  badges: Badge[];
  firstSeen?: number;
  lastSeen?: number;
  bidder: { markets: number; sealed: number; revealed: number; missed: number; pending: number; revealRate?: number; wins: number; nftWins: number };
  creator: { published: number; awarded: number; cancelled: number; failed: number; pendingAward: number; overdue: number; cancelRate?: number };
  seller: { listed: number; sold: number; noSale: number; cancelled: number; awaitingSettle: number; volume: bigint };
  disputes: { opened: number; aboutThem: number; upheldAgainst: number; rejectedAgainst: number; open: number; ids: bigint[] };
};

export type DisputeInput = { id: bigint; core: DisputeCore; openedAt: number };

const lc = (a: string) => a.toLowerCase();
const idOf = (e: ChainEvent) => ("tenderId" in e ? e.tenderId : "auctionId" in e ? e.auctionId : -1n);

function emptyProfile(address: Address): Profile {
  return {
    address,
    score: BASE_SCORE,
    level: "New",
    ledger: [],
    badges: [],
    bidder: { markets: 0, sealed: 0, revealed: 0, missed: 0, pending: 0, wins: 0, nftWins: 0 },
    creator: { published: 0, awarded: 0, cancelled: 0, failed: 0, pendingAward: 0, overdue: 0 },
    seller: { listed: 0, sold: 0, noSale: 0, cancelled: 0, awaitingSettle: 0, volume: 0n },
    disputes: { opened: 0, aboutThem: 0, upheldAgainst: 0, rejectedAgainst: 0, open: 0, ids: [] },
  };
}

export function computeReputation(snap: MarketSnapshot, disputes: DisputeInput[], nowSec: number): Map<string, Profile> {
  const profiles = new Map<string, Profile>();
  const get = (a: Address) => {
    const k = lc(a);
    if (!profiles.has(k)) profiles.set(k, emptyProfile(a));
    return profiles.get(k)!;
  };
  const raw: { who: Address; rule: RuleKey; time: number; txHash?: Hash; ref: Text }[] = [];
  const add = (who: Address, rule: RuleKey, time: number, ref: Text, txHash?: Hash) => raw.push({ who, rule, time, ref, txHash });

  for (const e of snap.events) {
    for (const a of actorsOf(e)) {
      const p = get(a);
      p.firstSeen = Math.min(p.firstSeen ?? e.time, e.time);
      p.lastSeen = Math.max(p.lastSeen ?? e.time, e.time);
    }
  }
  const evs = (source: "tender" | "nft", id: bigint) => snap.events.filter((e) => e.source === source && idOf(e) === id);

  // ── tenders ──
  for (const t of snap.tenders) {
    const state = tenderState(t.core, nowSec);
    const list = evs("tender", t.id);
    const ref: Text = [`Tender #${t.id}`, `Gói thầu #${t.id}`];
    const created = list.find((e) => e.name === "TenderCreated");
    const buyer = get(t.core.buyer);
    buyer.creator.published++;
    if (state === TenderState.Awarded) {
      buyer.creator.awarded++;
      const aw = list.find((e) => e.name === "TenderAwarded");
      add(t.core.buyer, "awarded", aw?.time ?? nowSec, ref, aw?.txHash);
      get(t.core.winner).bidder.wins++;
      add(t.core.winner, "wonTender", aw?.time ?? nowSec, ref, aw?.txHash);
    } else if (state === TenderState.Cancelled) {
      buyer.creator.cancelled++;
      const c = list.find((e) => e.name === "TenderCancelled");
      add(t.core.buyer, "cancelledTender", c?.time ?? nowSec, ref, c?.txHash);
    } else if (state === TenderState.Failed) {
      buyer.creator.failed++;
    } else if (state === TenderState.Evaluation) {
      buyer.creator.pendingAward++;
      if (nowSec - Number(t.core.revealDeadline) > STALLED_AFTER_S) {
        buyer.creator.overdue++;
        add(t.core.buyer, "overdueAward", Number(t.core.revealDeadline) + STALLED_AFTER_S, ref, created?.txHash);
      }
    }
    // bidders
    const sealed = new Map<string, ChainEvent>();
    const revealed = new Map<string, ChainEvent>();
    for (const e of list) {
      if (e.name === "BidSubmitted" && e.first) sealed.set(lc(e.bidder), e);
      if (e.name === "BidRevealed") revealed.set(lc(e.bidder), e);
    }
    for (const [k, s] of sealed) {
      const who = (s as Extract<ChainEvent, { name: "BidSubmitted" }>).bidder;
      const p = get(who);
      p.bidder.markets++;
      p.bidder.sealed++;
      const r = revealed.get(k);
      if (r) {
        p.bidder.revealed++;
        add(who, "revealed", r.time, ref, r.txHash);
      } else if (nowSec >= Number(t.core.revealDeadline) && !t.core.cancelled) {
        p.bidder.missed++;
        add(who, "missedReveal", Number(t.core.revealDeadline), ref, s.txHash);
      } else p.bidder.pending++;
    }
  }

  // ── NFT auctions ──
  for (const a of snap.auctions) {
    const state = auctionState(a.core, nowSec);
    const list = evs("nft", a.id);
    const ref: Text = [`NFT auction #${a.id}`, `Đấu giá NFT #${a.id}`];
    const seller = get(a.core.seller);
    seller.seller.listed++;
    const settled = list.find((e) => e.name === "AuctionSettled");
    if (state === AuctionState.Settled) {
      seller.seller.sold++;
      seller.seller.volume += a.core.highestBid;
      add(a.core.seller, "sold", settled?.time ?? nowSec, ref, settled?.txHash);
      get(a.core.highestBidder).bidder.nftWins++;
      add(a.core.highestBidder, "wonAuction", settled?.time ?? nowSec, ref, settled?.txHash);
    } else if (state === AuctionState.Cancelled) {
      seller.seller.cancelled++;
      const c = list.find((e) => e.name === "AuctionCancelled");
      add(a.core.seller, "cancelledAuction", c?.time ?? nowSec, ref, c?.txHash);
    } else if (state === AuctionState.NoSale) seller.seller.noSale++;
    else if (state === AuctionState.Settlement) seller.seller.awaitingSettle++;

    const sealed = new Map<string, ChainEvent>();
    const revealed = new Map<string, ChainEvent>();
    for (const e of list) {
      if (e.name === "BidPlaced" && e.first) sealed.set(lc(e.bidder), e);
      if (e.name === "BidRevealed") revealed.set(lc(e.bidder), e);
    }
    for (const [k, s] of sealed) {
      const who = (s as Extract<ChainEvent, { name: "BidPlaced" }>).bidder;
      const p = get(who);
      p.bidder.markets++;
      p.bidder.sealed++;
      const r = revealed.get(k);
      if (r) {
        p.bidder.revealed++;
        add(who, "revealed", r.time, ref, r.txHash);
      } else if (nowSec >= Number(a.core.revealDeadline)) {
        p.bidder.missed++;
        add(who, "missedReveal", Number(a.core.revealDeadline), ref, s.txHash);
      } else p.bidder.pending++;
    }
  }

  // ── disputes: only decided ones change scores, and only on grounds tied to the organizer ──
  for (const d of disputes) {
    const organizer =
      d.core.kind === TargetKind.Tender ? snap.tenders.find((t) => t.id === d.core.targetId)?.core.buyer : snap.auctions.find((a) => a.id === d.core.targetId)?.core.seller;
    const ref: Text = [`Dispute #${d.id}`, `Khiếu nại #${d.id}`];
    get(d.core.opener).disputes.opened++;
    get(d.core.opener).disputes.ids.push(d.id);
    if (!organizer) continue;
    const org = get(organizer);
    org.disputes.aboutThem++;
    if (!org.disputes.ids.includes(d.id)) org.disputes.ids.push(d.id);
    // Quality-of-goods cases are settled between the parties, outside Plinths: they never move scores.
    const counts = reasonOf(d.core.reason)?.track !== "parties";
    if (d.core.status === DisputeStatus.Resolved && counts) {
      org.disputes.upheldAgainst++;
      add(organizer, "disputeUpheldAgainst", d.openedAt || nowSec, ref);
      add(d.core.opener, "disputeUpheldOpened", d.openedAt || nowSec, ref);
    } else if (d.core.status === DisputeStatus.Rejected) org.disputes.rejectedAgainst++;
    else if (d.core.status === DisputeStatus.Open || d.core.status === DisputeStatus.UnderReview) org.disputes.open++;
  }

  // ── ledgers, scores, levels, badges ──
  raw.sort((x, y) => x.time - y.time);
  for (const r of raw) {
    const p = get(r.who);
    const score = Math.max(0, Math.min(100, (p.ledger.at(-1)?.scoreAfter ?? BASE_SCORE) + RULES[r.rule].points));
    p.ledger.push({ rule: r.rule, points: RULES[r.rule].points, time: r.time, txHash: r.txHash, ref: r.ref, scoreAfter: score });
  }
  for (const p of profiles.values()) {
    p.score = p.ledger.at(-1)?.scoreAfter ?? BASE_SCORE;
    p.bidder.revealRate = p.bidder.revealed + p.bidder.missed > 0 ? p.bidder.revealed / (p.bidder.revealed + p.bidder.missed) : undefined;
    p.creator.cancelRate = p.creator.published > 0 ? p.creator.cancelled / p.creator.published : undefined;
    p.level = p.ledger.length < 3 ? "New" : p.score >= 85 ? "Trusted" : p.score >= 65 ? "Reliable" : p.score < 40 ? "At risk" : "Building";
    p.badges = badgesOf(p);
  }
  return profiles;
}

function badgesOf(p: Profile): Badge[] {
  const b: Badge[] = [];
  const s = (n: number) => (n === 1 ? "" : "s");
  if (p.bidder.sealed >= 1) b.push({ key: "first-seal", label: ["First seal", "Lần niêm phong đầu"], detail: ["Sealed a first bid.", "Đã niêm phong giá thầu đầu tiên."] });
  if (p.bidder.revealed >= 3 && p.bidder.missed === 0)
    b.push({
      key: "perfect-reveals",
      label: ["Perfect reveals", "Công bố hoàn hảo"],
      detail: [`${p.bidder.revealed} reveals, none missed.`, `${p.bidder.revealed} lần công bố, không bỏ lần nào.`],
    });
  if (p.bidder.wins >= 1)
    b.push({
      key: "tender-winner",
      label: ["Tender winner", "Trúng thầu"],
      detail: [`Won ${p.bidder.wins} tender${s(p.bidder.wins)}.`, `Trúng ${p.bidder.wins} gói thầu.`],
    });
  if (p.bidder.nftWins >= 1)
    b.push({
      key: "collector",
      label: ["Collector", "Nhà sưu tầm"],
      detail: [`Won ${p.bidder.nftWins} NFT auction${s(p.bidder.nftWins)}.`, `Thắng ${p.bidder.nftWins} phiên đấu giá NFT.`],
    });
  if (p.creator.awarded >= 1)
    b.push({
      key: "finisher",
      label: ["Tender finisher", "Hoàn tất gói thầu"],
      detail: [`Awarded ${p.creator.awarded} tender${s(p.creator.awarded)}.`, `Đã trao ${p.creator.awarded} gói thầu.`],
    });
  if (p.creator.awarded >= 3 && p.creator.overdue === 0)
    b.push({
      key: "reliable-buyer",
      label: ["Reliable buyer", "Bên mời thầu đáng tin"],
      detail: ["Three or more awards, none overdue.", "Từ ba lần trao thầu trở lên, không lần nào trễ."],
    });
  if (p.seller.sold >= 1 && p.seller.cancelled === 0)
    b.push({
      key: "clean-seller",
      label: ["Clean seller", "Người bán sạch"],
      detail: [`${p.seller.sold} sale${s(p.seller.sold)}, no cancellations.`, `${p.seller.sold} lần bán, không hủy lần nào.`],
    });
  if (p.disputes.upheldAgainst === 0 && p.ledger.length >= 5)
    b.push({
      key: "no-upheld",
      label: ["No upheld disputes", "Không có khiếu nại bị chấp nhận"],
      detail: ["Five or more completed actions, no dispute upheld against them.", "Từ năm hoạt động hoàn tất trở lên, không khiếu nại nào chống lại họ được chấp nhận."],
    });
  return b;
}
