"use client";

import { Clock } from "lucide-react";
import { useLang, useT } from "@/components/lang-provider";
import { blindBidAddress } from "@/lib/contracts";
import { formatDateTime, formatDuration, localTimeZone } from "@/lib/format";
import { useChainHead, useChainNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Countdown driven by chain time (latest block timestamp), not the device clock. */
export function Countdown({
  deadline,
  label,
  passedLabel,
  className,
}: {
  deadline: bigint;
  label: string;
  passedLabel?: string;
  className?: string;
}) {
  const now = useChainNow();
  const t = useT();
  const lang = useLang();
  const remaining = now === undefined ? undefined : Number(deadline) - now;
  return (
    <div
      className={cn("flex items-center gap-1.5 text-sm", className)}
      title={`${formatDateTime(deadline, lang)} (${blindBidAddress ? t("chain time", "thời gian chain") : t("preview time", "thời gian xem trước")})`}
    >
      <Clock className="size-3.5 text-muted-foreground" />
      {remaining === undefined ? (
        <span className="text-muted-foreground">
          {blindBidAddress ? t("Syncing chain time…", "Đang đồng bộ thời gian chain…") : t("Loading preview time…", "Đang tải thời gian xem trước…")}
        </span>
      ) : remaining > 0 ? (
        <span>
          {label} <span className="font-medium tabular-nums">{formatDuration(remaining)}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">{passedLabel ?? t("Closed", "Đã đóng")}</span>
      )}
    </div>
  );
}

export function TimeNote() {
  const t = useT();
  if (!blindBidAddress) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(
          `Preview dates use your device clock and your time zone (${localTimeZone()}). Deadlines will be enforced by the contract after deployment.`,
          `Ngày xem trước dùng đồng hồ thiết bị và múi giờ của bạn (${localTimeZone()}). Sau khi triển khai, contract sẽ cưỡng chế thời hạn.`,
        )}
      </p>
    );
  }
  return <ChainTimeNote />;
}

function ChainTimeNote() {
  const head = useChainHead();
  const now = useChainNow();
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        {t(
          `Countdowns follow the latest PortaldotV3 block timestamp; dates are shown in your time zone (${localTimeZone()}). Deadlines are enforced by the contract.`,
          `Đồng hồ đếm ngược theo timestamp của block PortaldotV3 mới nhất; ngày giờ hiển thị theo múi giờ của bạn (${localTimeZone()}). Contract cưỡng chế các thời hạn.`,
        )}
      </p>
      {now !== undefined && head.data && (
        <p className="tabular-nums">
          {t("Chain time now:", "Thời gian chain hiện tại:")} <span className="text-foreground-soft">{formatDateTime(now, lang)}</span> ·{" "}
          {t("latest block", "block mới nhất")} #
          {head.data.number.toString()}
        </p>
      )}
    </div>
  );
}
