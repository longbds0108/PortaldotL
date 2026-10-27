"use client";

import { ArrowRight, Lock, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { BidRiskNotice } from "@/components/bid-risk-notice";
import { SweepForfeitsButton, WithdrawBondButton } from "@/components/bond-actions";
import { BuyerHistory } from "@/components/buyer-history";
import { useLang, useT } from "@/components/lang-provider";
import { Countdown, TimeNote } from "@/components/countdown";
import { ChainReference } from "@/components/chain-reference";
import { OnchainTimeline } from "@/components/onchain-timeline";
import { PhaseStepper } from "@/components/phase-stepper";
import { RevealPanel } from "@/components/reveal-panel";
import { StateBadge } from "@/components/state-badge";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenderState } from "@/lib/contracts";
import { formatBudget, formatDateTime, formatNativeAmount, shortHash } from "@/lib/format";
import { useBids, useBlindBidTx, type TenderRow } from "@/lib/hooks";
import { CATEGORY_LABEL, type TenderMetadata } from "@/lib/metadata";

export default function TenderDetailPage() {
  return <TenderShell>{(ctx) => <TenderDetail {...ctx} />}</TenderShell>;
}

function TenderDetail({ row, meta, refetch }: { row: TenderRow; meta?: TenderMetadata; refetch: () => void }) {
  const { id, tender, state } = row;
  const { address } = useAccount();
  const bids = useBids(id);
  const isBuyer = !!address && address.toLowerCase() === tender.buyer.toLowerCase();
  const myBid = bids.rows.find((b) => b.bidder.toLowerCase() === address?.toLowerCase())?.bid;
  const t = useT();
  const lang = useLang();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{meta?.category ? t(CATEGORY_LABEL[meta.category]) : "—"}</Badge>
          <StateBadge state={state} />
          <span className="text-xs text-muted-foreground">
            {t("Tender", "Gói thầu")} #{id.toString()}
          </span>
        </div>
        <h1 className="title-sheen text-[clamp(2rem,5vw,3.4rem)]">{meta?.title ?? t(`Tender #${id}`, `Gói thầu #${id}`)}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Published by", "Đăng bởi")} {meta?.buyerName ? `${meta.buyerName} · ` : ""}
          <ChainReference type="address" value={tender.buyer} />
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <PhaseStepper tender={tender} state={state} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Scope of work", "Phạm vi công việc")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <p className="whitespace-pre-wrap">{meta?.description ?? t("Loading…", "Đang tải…")}</p>
              {meta?.eligibility && (
                <div>
                  <h4 className="mb-1 font-medium">{t("Eligibility", "Điều kiện tham gia")}</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{meta.eligibility}</p>
                </div>
              )}
              {meta?.criteria && (
                <div>
                  <h4 className="mb-1 font-medium">{t("Evaluation criteria", "Tiêu chí đánh giá")}</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{meta.criteria}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Sealed bids", "Hồ sơ niêm phong")}</CardTitle>
              <CardDescription>
                {t(
                  "Only hashes are on-chain until the reveal window. Amounts are shown from the Evaluation phase on.",
                  "Trước cửa sổ công bố, trên chain chỉ có mã băm. Giá chỉ hiển thị từ giai đoạn Đánh giá trở đi.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bids.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("No bids yet.", "Chưa có hồ sơ nào.")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {bids.rows.map(({ bidder, bid }) => (
                    <li key={bidder} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <ChainReference type="address" value={bidder} />
                      <span className="font-mono text-xs text-muted-foreground" title={bid.commitment}>
                        {shortHash(bid.commitment)}
                      </span>
                      {bid.revealed ? (
                        <Badge variant="success">{t("Revealed", "Đã công bố")}</Badge>
                      ) : (
                        <Badge variant="muted">
                          <Lock className="size-3" /> {t("Sealed", "Niêm phong")}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("On-chain timeline", "Dòng thời gian on-chain")}</CardTitle>
            </CardHeader>
            <CardContent>
              <OnchainTimeline tenderId={id} tender={tender} bids={bids.rows} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-4 pt-5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Expected budget", "Ngân sách dự kiến")}</p>
                <p className="text-[1.55rem] font-normal tracking-[-0.04em] tabular-nums">{formatBudget(tender.budgetMin, tender.budgetMax)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("Bids", "Hồ sơ")}</p>
                  <p className="flex items-center gap-1 font-medium">
                    <Users className="size-3.5" /> {tender.bidCount}
                    {state !== TenderState.Open && (
                      <span className="text-muted-foreground">{t(`(${tender.revealedCount} revealed)`, `(${tender.revealedCount} đã công bố)`)}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("Bid bond", "Tiền bảo đảm")}</p>
                  <p className="font-medium">{tender.bidBond > 0n ? formatNativeAmount(tender.bidBond) : t("None", "Không có")}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("Submission deadline", "Hạn nộp hồ sơ")}</p>
                <p>{formatDateTime(tender.submissionDeadline, lang)}</p>
                {state === TenderState.Open && <Countdown deadline={tender.submissionDeadline} label={t("Closes in", "Đóng sau")} />}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("Reveal deadline", "Hạn công bố")}</p>
                <p>{formatDateTime(tender.revealDeadline, lang)}</p>
                {state === TenderState.Reveal && <Countdown deadline={tender.revealDeadline} label={t("Reveal ends in", "Hết hạn công bố sau")} />}
              </div>
              <TimeNote />
              <p className="flex items-start gap-2 well rounded-[12px] p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />{" "}
                {t(
                  "Bid amounts remain confidential until the submission deadline — not even the buyer can read them.",
                  "Giá thầu được giữ kín đến hạn nộp hồ sơ — kể cả bên mời thầu cũng không đọc được.",
                )}
              </p>
            </CardContent>
          </Card>

          {state === TenderState.Open && !isBuyer && <BidRiskNotice tender={tender} />}
          <Actions row={row} isBuyer={isBuyer} myBid={myBid} onChange={() => { refetch(); void bids.refetch(); }} />
          <BuyerHistory buyer={tender.buyer} />
        </div>
      </div>
    </div>
  );
}

function Actions({
  row,
  isBuyer,
  myBid,
  onChange,
}: {
  row: TenderRow;
  isBuyer: boolean;
  myBid?: import("@/lib/contracts").Bid;
  onChange: () => void;
}) {
  const { id, tender, state } = row;
  const { isConnected } = useAccount();
  const cancelTx = useBlindBidTx();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const finished = state === TenderState.Evaluation || state === TenderState.Awarded || state === TenderState.Failed;
  const t = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isBuyer ? t("Buyer actions", "Thao tác của bên mời thầu") : t("Take part", "Tham gia")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === TenderState.Open && !isBuyer && (
          <Button asChild className="w-full">
            <Link href={`/tenders/${id}/bid`}>
              {myBid ? t("Update sealed bid", "Cập nhật hồ sơ niêm phong") : t("Submit sealed bid", "Gửi hồ sơ niêm phong")} <ArrowRight />
            </Link>
          </Button>
        )}
        {state === TenderState.Open && isBuyer && tender.bidCount === 0 && (
          <div className="space-y-2">
            {confirmCancel ? (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm">{t("Cancel this tender? This cannot be undone.", "Hủy gói thầu này? Không thể hoàn tác.")}</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelTx.busy}
                    onClick={async () => {
                      if (await cancelTx.send("cancel", [id])) onChange();
                    }}
                  >
                    {t("Yes, cancel tender", "Có, hủy gói thầu")}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={cancelTx.busy} onClick={() => setConfirmCancel(false)}>
                    {t("Keep it", "Giữ lại")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setConfirmCancel(true)}>
                {t("Cancel tender", "Hủy gói thầu")}
              </Button>
            )}
            <TxStatus status={cancelTx.status} hash={cancelTx.hash} error={cancelTx.error} />
          </div>
        )}
        {state === TenderState.Open && isBuyer && tender.bidCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("Bidding is in progress. Bids can be compared after the reveal window.", "Đang nhận hồ sơ. Có thể so sánh các hồ sơ sau cửa sổ công bố.")}
          </p>
        )}

        {state === TenderState.Reveal && myBid && !myBid.revealed && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("Reveal your bid before the deadline", "Hãy công bố giá trước hạn")}</p>
            <p className="text-xs text-muted-foreground">
              {tender.bidBond > 0n
                ? t("Unrevealed bids are excluded and their bond is forfeited.", "Hồ sơ không công bố sẽ bị loại và mất tiền bảo đảm.")
                : t("Unrevealed bids are excluded.", "Hồ sơ không công bố sẽ bị loại.")}
            </p>
            <RevealPanel tenderId={id} bid={myBid} onRevealed={onChange} />
          </div>
        )}
        {state === TenderState.Reveal && myBid?.revealed && <p className="text-sm text-success">{t("Your bid is revealed.", "Giá của bạn đã được công bố.")}</p>}
        {state === TenderState.Reveal && !myBid && (
          <p className="text-sm text-muted-foreground">{t("Submissions are closed. Bidders are revealing.", "Đã đóng nhận hồ sơ. Các nhà thầu đang công bố giá.")}</p>
        )}

        {state === TenderState.Evaluation && isBuyer && (
          <Button asChild className="w-full">
            <Link href={`/tenders/${id}/evaluate`}>
              {t("Evaluate bids", "Đánh giá hồ sơ")} <ArrowRight />
            </Link>
          </Button>
        )}
        {finished && (
          <Button asChild variant={state === TenderState.Evaluation && isBuyer ? "outline" : "default"} className="w-full">
            <Link href={`/tenders/${id}/results`}>
              {state === TenderState.Awarded
                ? t("View results & proof", "Xem kết quả & bằng chứng")
                : t("View process & status", "Xem quy trình & trạng thái")}{" "}
              <ArrowRight />
            </Link>
          </Button>
        )}
        {state === TenderState.Cancelled && (
          <p className="text-sm text-muted-foreground">{t("This tender was cancelled by the buyer.", "Gói thầu này đã bị bên mời thầu hủy.")}</p>
        )}

        {myBid && <WithdrawBondButton tenderId={id} bid={myBid} onDone={onChange} />}
        {isConnected && <SweepForfeitsButton tenderId={id} />}
        {!isConnected && (
          <p className="text-xs text-muted-foreground">{t("Connect a wallet to bid or manage this tender.", "Kết nối ví để dự thầu hoặc quản lý gói thầu này.")}</p>
        )}
      </CardContent>
    </Card>
  );
}
