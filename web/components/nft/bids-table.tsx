"use client";

import { Lock, Trophy } from "lucide-react";
import { useLang, useT } from "@/components/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNativeAmount, shortAddress } from "@/lib/format";
import { AuctionState, type AuctionRow } from "@/lib/nft-auction";
import { useAuctionBids, type AuctionBidRow } from "@/lib/nft-hooks";
import { cn } from "@/lib/utils";

/** Every bid on an auction: deposits are public, prices appear only once each bidder reveals. */
export function BidsTable({ row }: { row: AuctionRow }) {
  const { rows, isLoading } = useAuctionBids(row.id);
  const { auction, state } = row;
  const closed = state >= AuctionState.Settlement;
  const leader = auction.highestBidder.toLowerCase();
  const t = useT();
  const sorted = [...rows].sort((a, b) => {
    if (a.bid.revealed !== b.bid.revealed) return a.bid.revealed ? -1 : 1;
    return a.bid.amount > b.bid.amount ? -1 : a.bid.amount < b.bid.amount ? 1 : 0;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Bids", "Lượt đặt giá")}</CardTitle>
        <CardDescription>
          {t(
            "Deposits are public. Prices stay sealed until each bidder reveals; a price counts only if it meets the reserve and fits the bidder's deposit.",
            "Tiền cọc công khai. Giá được niêm phong đến khi từng người công bố; giá chỉ được tính nếu đạt giá sàn và không vượt tiền cọc của người đó.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("No bids yet.", "Chưa có lượt đặt giá nào.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                <tr className="border-b border-overlay/[0.07]">
                  <th className="py-2.5 pr-3 font-medium">{t("Bidder", "Người đặt giá")}</th>
                  <th className="py-2.5 pr-3 font-medium">{t("Deposit", "Tiền cọc")}</th>
                  <th className="py-2.5 pr-3 font-medium">{t("Status", "Trạng thái")}</th>
                  <th className="py-2.5 text-right font-medium">{t("Price", "Giá")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-overlay/[0.06]">
                {sorted.map((r) => (
                  <BidLine key={r.bidder} r={r} reserve={auction.reservePrice} closed={closed} leading={r.bidder.toLowerCase() === leader} state={state} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BidLine({ r, reserve, closed, leading, state }: { r: AuctionBidRow; reserve: bigint; closed: boolean; leading: boolean; state: AuctionState }) {
  const { bid } = r;
  const t = useT();
  const lang = useLang();
  const counted = bid.revealed && bid.amount >= reserve && bid.amount <= bid.deposit;
  const status = bid.revealed ? (
    counted ? (
      leading ? (
        <Badge variant="success" dot>
          {closed ? t("Winner", "Thắng") : t("Leading", "Dẫn đầu")}
        </Badge>
      ) : (
        <Badge variant="secondary">{t("Counted", "Được tính")}</Badge>
      )
    ) : (
      <Badge variant="warning" title={bid.amount > bid.deposit ? t("Price above deposit", "Giá vượt tiền cọc") : t("Below reserve", "Dưới giá sàn")}>
        {t("Not counted", "Không được tính")}
      </Badge>
    )
  ) : closed || state === AuctionState.Cancelled ? (
    <Badge variant="destructive">{t("Not revealed", "Không công bố")}</Badge>
  ) : (
    <Badge variant="muted">{t("Sealed", "Niêm phong")}</Badge>
  );

  return (
    <tr className={cn(leading && counted && "bg-[rgba(79,209,197,.05)]")}>
      <td className="py-3 pr-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
          {leading && counted && <Trophy className="size-3.5 text-success" />}
          {shortAddress(r.bidder)}
        </span>
        <span className="block text-[0.68rem] text-muted-foreground">{formatDateTime(bid.committedAt, lang)}</span>
      </td>
      <td className="py-3 pr-3 tabular-nums">{formatNativeAmount(bid.deposit)}</td>
      <td className="py-3 pr-3">{status}</td>
      <td className="py-3 text-right tabular-nums">
        {bid.revealed ? (
          formatNativeAmount(bid.amount)
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock className="size-3" /> {t("Sealed", "Niêm phong")}
          </span>
        )}
      </td>
    </tr>
  );
}
