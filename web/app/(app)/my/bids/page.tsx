"use client";

import { CheckCircle2, ChevronDown, Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import type { Hash } from "viem";
import { WithdrawBondButton } from "@/components/bond-actions";
import { ChainReference } from "@/components/chain-reference";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/empty-state";
import { ConfigGate, WalletGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { RevealPanel } from "@/components/reveal-panel";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TenderState, pricesVisible } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/format";
import { useMyBid, useMyBidTenderIds, useTenderMetadata, useTenders, type TenderRow } from "@/lib/hooks";

export default function MyBidsPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        eyebrow={t("Bidder workspace", "Không gian nhà thầu")}
        title={t("My Bids", "Hồ sơ thầu của tôi")}
        description={t(
          "Your sealed bids. Reveal them during each tender's reveal window.",
          "Các hồ sơ niêm phong của bạn. Hãy công bố trong cửa sổ công bố của từng gói thầu.",
        )}
      />
      <ConfigGate>
        <WalletGate>
          <MyBids />
        </WalletGate>
      </ConfigGate>
    </>
  );
}

function MyBids() {
  const ids = useMyBidTenderIds();
  const { rows, isLoading } = useTenders(ids.data ?? []);
  const t = useT();
  if (ids.isLoading || (isLoading && (ids.data?.length ?? 0) > 0)) return <Skeleton className="h-40" />;
  if (!ids.data?.length) {
    return (
      <EmptyState
        title={t("No sealed bids yet", "Chưa có hồ sơ niêm phong nào")}
        action={
          <Button asChild>
            <Link href="/marketplace">{t("Browse marketplace", "Xem sàn thầu")}</Link>
          </Button>
        }
      >
        {t(
          "Bids you submit from this wallet will appear here, with a Reveal button when the window opens.",
          "Các hồ sơ bạn gửi từ ví này sẽ hiện ở đây, kèm nút Công bố khi cửa sổ công bố mở.",
        )}
      </EmptyState>
    );
  }
  // tenders needing a reveal first
  const sorted = [...rows].sort((a, b) => Number(b.state === TenderState.Reveal) - Number(a.state === TenderState.Reveal));
  return (
    <div className="space-y-3">
      {sorted.map((r) => (
        <MyBidCard key={r.id.toString()} row={r} />
      ))}
    </div>
  );
}

function MyBidCard({ row }: { row: TenderRow }) {
  const { id, tender, state } = row;
  const { address } = useAccount();
  const meta = useTenderMetadata(tender.metadataURI);
  const myBid = useMyBid(id);
  const bid = myBid.data;
  const needsReveal = state === TenderState.Reveal && bid && !bid.revealed;
  const [open, setOpen] = useState(false);
  const [revealTx, setRevealTx] = useState<Hash>();
  const isWinner = state === TenderState.Awarded && tender.winner.toLowerCase() === address?.toLowerCase();
  const t = useT();

  return (
    <Card className={needsReveal ? "border-warning" : undefined}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={state} />
              {isWinner && (
                <Badge>
                  <Trophy className="size-3" /> {t("You won", "Bạn trúng thầu")}
                </Badge>
              )}
              {bid?.revealed ? (
                <Badge variant="success">{t("Revealed", "Đã công bố")}</Badge>
              ) : (
                <Badge variant="muted">
                  <Lock className="size-3" /> {t("Sealed", "Niêm phong")}
                </Badge>
              )}
            </div>
            <Link href={`/tenders/${id}`} className="block truncate font-medium hover:underline">
              {meta.data?.title ?? t(`Tender #${id}`, `Gói thầu #${id}`)}
            </Link>
            {bid?.revealed && pricesVisible(state) && (
              <p className="text-sm text-muted-foreground">
                {t("Your bid:", "Giá của bạn:")} {formatTokenAmount(bid.amount)}
              </p>
            )}
            {state === TenderState.Open && <Countdown deadline={tender.submissionDeadline} label={t("Reveal opens in", "Mở công bố sau")} />}
            {state === TenderState.Reveal && <Countdown deadline={tender.revealDeadline} label={t("Reveal closes in", "Đóng công bố sau")} />}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {state === TenderState.Open && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/tenders/${id}/bid`}>{t("Update bid", "Cập nhật hồ sơ")}</Link>
              </Button>
            )}
            {needsReveal && (
              <Button size="sm" onClick={() => setOpen((o) => !o)}>
                {t("Reveal", "Công bố")} <ChevronDown className={open ? "rotate-180" : undefined} />
              </Button>
            )}
            {(state === TenderState.Evaluation || state === TenderState.Awarded || state === TenderState.Failed) && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/tenders/${id}/results`}>{t("Results", "Kết quả")}</Link>
              </Button>
            )}
          </div>
        </div>
        {needsReveal && open && bid && (
          <div className="well rounded-[15px] p-4">
            <RevealPanel
              tenderId={id}
              bid={bid}
              onRevealed={(hash) => {
                setRevealTx(hash);
                void myBid.refetch();
              }}
            />
          </div>
        )}
        {state === TenderState.Reveal && bid?.revealed && (
          // The reveal panel unmounts once the refetched bid is revealed, so confirm here.
          <p className="flex flex-wrap items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />{" "}
            {t("Your bid is revealed. It will be compared after the reveal deadline.", "Giá của bạn đã được công bố. Hồ sơ sẽ được so sánh sau hạn công bố.")}
            {revealTx && <ChainReference type="tx" value={revealTx} />}
          </p>
        )}
        {bid && <WithdrawBondButton tenderId={id} bid={bid} onDone={() => void myBid.refetch()} />}
        {state !== TenderState.Open && state !== TenderState.Reveal && bid && !bid.revealed && bid.bond > 0n && (
          <p className="text-xs text-destructive">
            {t("Not revealed in time — this bid was excluded and its bond forfeited.", "Không công bố đúng hạn — hồ sơ bị loại và mất tiền bảo đảm.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
