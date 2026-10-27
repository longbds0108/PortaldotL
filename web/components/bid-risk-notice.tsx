"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useLang, useT } from "@/components/lang-provider";
import type { Tender } from "@/lib/contracts";
import { formatDateTime, formatDuration, formatNativeAmount } from "@/lib/format";
import { bidRisks } from "@/lib/risk";
import { cn } from "@/lib/utils";

/** Shown before bidding: the reveal window, the bond and its rules, plus warnings for risky settings. */
export function BidRiskNotice({ tender, className }: { tender: Tender; className?: string }) {
  const t = useT();
  const lang = useLang();
  const { revealWindowS, warnings } = bidRisks(tender, t);
  const worst = warnings.some((w) => w.level === "high") ? "high" : warnings.length ? "medium" : "none";
  return (
    <div
      className={cn(
        "rounded-[16px] border p-4 text-[0.82rem] leading-relaxed",
        worst === "high"
          ? "border-[rgba(229,72,77,.35)] bg-[rgba(229,72,77,.07)]"
          : worst === "medium"
            ? "border-[rgba(232,181,76,.3)] bg-[rgba(232,181,76,.06)]"
            : "border-[rgba(113,161,232,.16)] bg-[var(--well)]",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        {worst === "none" ? <Info className="size-4 text-link" /> : <AlertTriangle className={cn("size-4", worst === "high" ? "text-destructive" : "text-warning")} />}
        {t("Before you bid", "Trước khi dự thầu")}
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">
            {t("Reveal window", "Cửa sổ công bố")} ({formatDuration(revealWindowS)})
          </dt>
          <dd>
            {formatDateTime(tender.submissionDeadline, lang)} → {formatDateTime(tender.revealDeadline, lang)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Bid bond", "Tiền bảo đảm")}</dt>
          <dd>
            {tender.bidBond > 0n
              ? t(`${formatNativeAmount(tender.bidBond)} locked until you reveal`, `${formatNativeAmount(tender.bidBond)} bị khóa đến khi bạn công bố`)
              : t("None — only network fees", "Không có — chỉ mất phí mạng")}
          </dd>
        </div>
      </dl>
      {tender.bidBond > 0n && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Reveal in time and you can withdraw the full bond, win or lose. Miss the window and it goes to the Plinths treasury — never to the buyer.",
            "Công bố đúng hạn thì bạn rút lại toàn bộ tiền bảo đảm, dù thắng hay thua. Lỡ hạn thì khoản này chuyển về treasury của Plinths — không bao giờ về bên mời thầu.",
          )}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w.text} className={cn("flex gap-2 text-xs", w.level === "high" ? "text-destructive-fg" : "text-warning-fg")}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
