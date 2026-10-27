import type { Address, Hash, Hex } from "viem";
import { computeCommitment } from "./commitment";
import { translator, type T } from "./i18n";
import type { BidCore, TenderCore } from "./market-storage";
import type { MarketLog } from "./market-logs";
import { computeNftCommitment } from "./nft-commitment";
import type { NftAuctionLog } from "./nft-logs";
import type { AuctionBidCore, AuctionCore } from "./nft-storage";

/*
 * Verification Engine for disputes that on-chain data can settle by itself: late bids or reveals, reveals that do
 * not open their commitment, and NFTs / deposits / bonds after settlement. It only uses public chain data (storage
 * + events), so anyone running it gets the same result. The contracts already enforce these rules; the engine
 * shows that they were applied to this tender or auction, with the transactions that prove it.
 * Texts follow the UI language (`t`); the Agent's server route uses the English default.
 */

export type CheckStatus = "pass" | "fail" | "pending" | "unknown";
export type CheckItem = { label: string; status: CheckStatus; detail: string; txHash?: Hash };
export type EngineCheck = { key: "deadlines" | "reveals" | "settlement"; title: string; status: CheckStatus; summary: string; items: CheckItem[] };

export type TenderData = { core: TenderCore; logs: MarketLog[]; bids: Map<string, BidCore> };
export type AuctionData = { core: AuctionCore; logs: NftAuctionLog[]; bids: Map<string, AuctionBidCore>; nftOwner?: Address };

const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const EN = translator("en");

function overall(items: CheckItem[], empty: string, t: T): { status: CheckStatus; summary: string } {
  const failed = items.filter((i) => i.status === "fail").length;
  if (failed) return { status: "fail", summary: t(`${failed} problem(s) found.`, `Phát hiện ${failed} vấn đề.`) };
  if (!items.length) return { status: "pass", summary: empty };
  if (items.some((i) => i.status === "pending")) return { status: "pending", summary: t("Not finished yet — see below.", "Chưa xong — xem bên dưới.") };
  if (items.every((i) => i.status === "unknown"))
    return {
      status: "unknown",
      summary: t(
        "The RPC no longer serves these blocks' times; the contract enforced the deadlines when they were sent.",
        "RPC không còn trả về thời gian của các block này; contract đã cưỡng chế thời hạn lúc giao dịch được gửi.",
      ),
    };
  return { status: "pass", summary: t("Every item checks out.", "Mọi mục đều hợp lệ.") };
}

/** A transaction time against a window; block times may be missing for old blocks (pruned RPC). */
function timeItem(label: string, at: bigint | undefined, from: bigint | undefined, to: bigint, txHash: Hash, t: T): CheckItem {
  if (!at)
    return {
      label,
      status: "unknown",
      detail: t(
        "Block time unavailable from the RPC; accepted by the contract, which checks the deadline itself.",
        "RPC không có thời gian block; contract đã chấp nhận giao dịch và tự kiểm tra thời hạn.",
      ),
      txHash,
    };
  const ok = (from === undefined || at >= from) && at < to;
  return {
    label,
    status: ok ? "pass" : "fail",
    detail: ok ? t("Inside the allowed window.", "Nằm trong khung thời gian cho phép.") : t("Outside the allowed window.", "Nằm ngoài khung thời gian cho phép."),
    txHash,
  };
}

const sealedBy = (first: boolean, bidder: string, t: T) =>
  first ? t(`Bid sealed by ${short(bidder)}`, `Giá niêm phong của ${short(bidder)}`) : t(`Bid replaced by ${short(bidder)}`, `Giá thay thế của ${short(bidder)}`);
const revealBy = (bidder: string, t: T) => t(`Reveal by ${short(bidder)}`, `Công bố của ${short(bidder)}`);

// ───────────────────────── tenders ─────────────────────────

export function tenderChecks(data: TenderData, times: Map<bigint, bigint>, nowSec: number, t: T = EN): EngineCheck[] {
  const { core, logs } = data;
  const at = (b: bigint) => times.get(b);

  const deadlineItems: CheckItem[] = logs.flatMap((l) =>
    l.name === "BidSubmitted"
      ? [timeItem(sealedBy(l.first, l.bidder, t), at(l.blockNumber), undefined, core.submissionDeadline, l.txHash, t)]
      : l.name === "BidRevealed"
        ? [timeItem(revealBy(l.bidder, t), at(l.blockNumber), core.submissionDeadline, core.revealDeadline, l.txHash, t)]
        : [],
  );

  // The commitment in force at reveal time is the last BidSubmitted before it.
  const lastCommit = new Map<string, Hex>();
  const revealItems: CheckItem[] = [];
  for (const l of logs) {
    if (l.name === "BidSubmitted") lastCommit.set(l.bidder.toLowerCase(), l.commitment);
    if (l.name === "BidRevealed") {
      const sealed = lastCommit.get(l.bidder.toLowerCase());
      const recomputed = computeCommitment({ tenderId: l.tenderId, bidder: l.bidder, amount18: l.amount, salt: l.salt, docKey: l.docKey });
      const ok = !!sealed && recomputed.toLowerCase() === sealed.toLowerCase();
      revealItems.push({
        label: revealBy(l.bidder, t),
        status: ok ? "pass" : "fail",
        detail: ok
          ? t("Price, salt and key hash back to the sealed commitment.", "Giá, salt và khóa băm ra đúng commitment đã niêm phong.")
          : t("Does not hash back to the sealed commitment.", "Không băm ra đúng commitment đã niêm phong."),
        txHash: l.txHash,
      });
    }
  }

  const settlementItems: CheckItem[] = [];
  const closed = nowSec >= Number(core.revealDeadline);
  for (const [bidder, b] of data.bids) {
    if (b.bond === 0n) continue;
    const label = t(`Bond of ${short(bidder)}`, `Tiền bảo đảm của ${short(bidder)}`);
    if (b.revealed) {
      settlementItems.push({
        label,
        status: "pass",
        detail: b.bondWithdrawn
          ? t("Revealed; bond withdrawn.", "Đã công bố; đã rút tiền bảo đảm.")
          : t("Revealed; bond available to withdraw at any time.", "Đã công bố; có thể rút tiền bảo đảm bất cứ lúc nào."),
      });
    } else if (!closed) {
      settlementItems.push({ label, status: "pending", detail: t("Not revealed yet; the reveal window is still open.", "Chưa công bố; cửa sổ công bố vẫn mở.") });
    } else {
      settlementItems.push({
        label,
        status: "pass",
        detail: core.forfeitSwept
          ? t("Not revealed; forfeited to the treasury (never to the buyer).", "Không công bố; bị phạt về treasury (không bao giờ về bên mời thầu).")
          : t("Not revealed; forfeited — anyone can send it to the treasury.", "Không công bố; bị phạt — ai cũng có thể chuyển khoản này về treasury."),
      });
    }
  }

  const noBids = t("No bids or reveals to check.", "Chưa có hồ sơ hay lượt công bố nào để kiểm tra.");
  const noReveals = t("No reveals yet.", "Chưa có lượt công bố nào.");
  return [
    { key: "deadlines", title: t("Deadlines", "Thời hạn"), ...overall(deadlineItems, noBids, t), items: deadlineItems },
    { key: "reveals", title: t("Reveals match commitments", "Công bố khớp commitment"), ...overall(revealItems, noReveals, t), items: revealItems },
    {
      key: "settlement",
      title: t("Bonds after the tender", "Tiền bảo đảm sau gói thầu"),
      ...overall(settlementItems, t("This tender has no bonds.", "Gói thầu này không có tiền bảo đảm."), t),
      items: settlementItems,
    },
  ];
}

// ───────────────────────── NFT auctions ─────────────────────────

export function auctionChecks(a: AuctionData, times: Map<bigint, bigint>, nowSec: number, t: T = EN): EngineCheck[] {
  const { core, logs } = a;
  const at = (b: bigint) => times.get(b);

  const deadlineItems: CheckItem[] = logs.flatMap((l) =>
    l.name === "BidPlaced"
      ? [timeItem(sealedBy(l.first, l.bidder, t), at(l.blockNumber), undefined, core.bidDeadline, l.txHash, t)]
      : l.name === "BidRevealed"
        ? [timeItem(revealBy(l.bidder, t), at(l.blockNumber), core.bidDeadline, core.revealDeadline, l.txHash, t)]
        : [],
  );

  const lastCommit = new Map<string, Hex>();
  const revealItems: CheckItem[] = [];
  for (const l of logs) {
    if (l.name === "BidPlaced") lastCommit.set(l.bidder.toLowerCase(), l.commitment);
    if (l.name === "BidRevealed") {
      const sealed = lastCommit.get(l.bidder.toLowerCase());
      const ok = !!sealed && computeNftCommitment({ auctionId: l.auctionId, bidder: l.bidder, amount18: l.amount, salt: l.salt }).toLowerCase() === sealed.toLowerCase();
      revealItems.push({
        label: revealBy(l.bidder, t),
        status: ok ? "pass" : "fail",
        detail: !ok
          ? t("Does not hash back to the sealed bid.", "Không băm ra đúng giá đã niêm phong.")
          : l.counted
            ? t("Hashes back to the sealed bid; counted.", "Băm ra đúng giá đã niêm phong; được tính.")
            : t(
                "Hashes back to the sealed bid; not counted (reserve, deposit or lower than the leader).",
                "Băm ra đúng giá đã niêm phong; không được tính (dưới giá sàn, thiếu cọc hoặc thấp hơn người dẫn đầu).",
              ),
        txHash: l.txHash,
      });
    }
  }

  const settlementItems: CheckItem[] = [];
  const settled = logs.find((l) => l.name === "AuctionSettled");
  const cancelled = logs.find((l) => l.name === "AuctionCancelled");
  const winner = core.highestBidder !== ZERO ? core.highestBidder : undefined;
  if (cancelled) {
    settlementItems.push({
      label: "NFT",
      status: "pass",
      detail: t(
        "Cancelled before any bid; the NFT went back to the seller in the same transaction.",
        "Đã hủy trước khi có giá nào; NFT được trả lại người bán ngay trong giao dịch đó.",
      ),
      txHash: cancelled.txHash,
    });
  } else if (nowSec < Number(core.revealDeadline)) {
    settlementItems.push({
      label: "NFT",
      status: "pending",
      detail: t("The auction is still running; the NFT stays in the auction contract.", "Phiên đấu giá vẫn đang chạy; NFT nằm trong contract đấu giá."),
    });
  } else if (!settled) {
    settlementItems.push({
      label: "NFT",
      status: "pending",
      detail: t(
        "Ready to settle. Anyone can call Settle; until then the NFT and the deposits stay in the contract.",
        "Sẵn sàng kết thúc. Ai cũng có thể gọi Settle; đến lúc đó NFT và tiền cọc vẫn nằm trong contract.",
      ),
    });
  } else {
    const to = winner ?? core.seller;
    const owner = a.nftOwner;
    settlementItems.push({
      label: "NFT",
      status: "pass",
      detail:
        (winner
          ? t(`Delivered to the winner ${short(to)}`, `Đã giao cho người thắng ${short(to)}`)
          : t(`Delivered to the seller ${short(to)}`, `Đã trả lại người bán ${short(to)}`)) +
        t(" in the settle transaction (it reverts if the transfer fails).", " trong giao dịch settle (giao dịch sẽ revert nếu chuyển thất bại).") +
        (owner && owner.toLowerCase() !== to.toLowerCase()
          ? t(` It has moved since; current owner ${short(owner)}.`, ` Sau đó NFT đã được chuyển đi; chủ hiện tại ${short(owner)}.`)
          : ""),
      txHash: settled.txHash,
    });
    if (winner) {
      settlementItems.push({
        label: t("Seller proceeds", "Tiền bán của người bán"),
        status: "pass",
        detail: core.proceedsPaid ? t("Withdrawn by the seller.", "Người bán đã rút.") : t("Available for the seller to withdraw.", "Người bán có thể rút."),
      });
    }
  }
  for (const [bidder, b] of a.bids) {
    if (b.deposit === 0n) continue;
    const isWinner = !!winner && bidder.toLowerCase() === winner.toLowerCase();
    const closedNow = nowSec >= Number(core.revealDeadline);
    let detail: string;
    let status: CheckStatus = "pass";
    if (b.withdrawn) detail = t("Withdrawn.", "Đã rút.");
    else if (b.revealed && !isWinner) detail = t("Outbid or not counted; full deposit available to withdraw.", "Bị vượt giá hoặc không được tính; có thể rút toàn bộ tiền cọc.");
    else if (!closedNow) {
      status = "pending";
      detail = b.revealed ? t("Leading; locked until the reveal deadline.", "Đang dẫn đầu; bị khóa đến hạn công bố.") : t("Not revealed yet.", "Chưa công bố.");
    } else
      detail = isWinner
        ? t("Winner; deposit above the price available to withdraw.", "Người thắng; phần cọc vượt giá có thể rút.")
        : t("Not revealed; deposit minus 10% available to withdraw.", "Không công bố; có thể rút tiền cọc sau khi trừ 10%.");
    settlementItems.push({ label: t(`Deposit of ${short(bidder)}`, `Tiền cọc của ${short(bidder)}`), status, detail });
  }

  const noBids = t("No bids or reveals to check.", "Chưa có lượt đặt giá hay công bố nào để kiểm tra.");
  const noReveals = t("No reveals yet.", "Chưa có lượt công bố nào.");
  return [
    { key: "deadlines", title: t("Deadlines", "Thời hạn"), ...overall(deadlineItems, noBids, t), items: deadlineItems },
    { key: "reveals", title: t("Reveals match sealed bids", "Công bố khớp giá niêm phong"), ...overall(revealItems, noReveals, t), items: revealItems },
    {
      key: "settlement",
      title: t("NFT and payouts after settlement", "NFT và chi trả sau khi kết thúc"),
      ...overall(settlementItems, t("Nothing to settle.", "Không có gì để kết thúc."), t),
      items: settlementItems,
    },
  ];
}
