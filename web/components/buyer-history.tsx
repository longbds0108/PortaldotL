"use client";

import { ShieldAlert, UserRound } from "lucide-react";
import type { Address } from "viem";
import { ChainReference } from "@/components/chain-reference";
import { useT } from "@/components/lang-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuyerHistory } from "@/lib/hooks";

/** Buyer track record computed from on-chain tenders only (no off-chain reputation). */
export function BuyerHistory({ buyer }: { buyer: Address }) {
  const { history: h } = useBuyerHistory(buyer);
  const t = useT();

  const flags: string[] = [];
  if (h) {
    if (h.total <= 1) flags.push(t("First tender from this wallet — no track record yet.", "Gói thầu đầu tiên của ví này — chưa có lịch sử."));
    if (h.stalled > 0)
      flags.push(
        t(
          `${h.stalled} tender${h.stalled > 1 ? "s" : ""} with revealed bids still not awarded more than 7 days after the reveal deadline.`,
          `${h.stalled} gói thầu đã có giá công bố nhưng vẫn chưa trao thầu sau hạn công bố hơn 7 ngày.`,
        ),
      );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4" /> {t("About the buyer", "Về bên mời thầu")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          <ChainReference type="address" value={buyer} /> · {t("history on this contract", "lịch sử trên contract này")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!h ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label={t("Tenders published", "Gói thầu đã đăng")} value={h.total} />
              <Stat label={t("Awarded", "Đã trao thầu")} value={h.awarded} />
              <Stat label={t("Open / revealing", "Đang mở / công bố")} value={h.active} />
              <Stat label={t("Awaiting award", "Chờ trao thầu")} value={h.awaitingAward} />
              <Stat label={t("Not awarded > 7 days", "Chưa trao > 7 ngày")} value={h.stalled} warn={h.stalled > 0} />
              <Stat label={t("No bid revealed", "Không ai công bố")} value={h.failed} />
              <Stat label={t("Cancelled (no bids)", "Đã hủy (chưa có hồ sơ)")} value={h.cancelled} />
            </dl>
            {flags.length > 0 && (
              <ul className="space-y-1.5 rounded-[12px] border border-[rgba(232,181,76,.25)] bg-[rgba(232,181,76,.06)] p-3 text-xs text-warning-fg">
                {flags.map((f) => (
                  <li key={f} className="flex gap-2">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={warn ? "font-medium text-warning" : "font-medium"}>{value}</dd>
    </div>
  );
}
