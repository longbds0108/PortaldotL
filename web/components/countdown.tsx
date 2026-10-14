"use client";

import { Clock } from "lucide-react";
import { blindBidAddress } from "@/lib/contracts";
import { formatDateTime, formatDuration, localTimeZone } from "@/lib/format";
import { useChainNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Countdown driven by chain time (latest block timestamp), not the device clock. */
export function Countdown({
  deadline,
  label,
  passedLabel = "Closed",
  className,
}: {
  deadline: bigint;
  label: string;
  passedLabel?: string;
  className?: string;
}) {
  const now = useChainNow();
  const remaining = now === undefined ? undefined : Number(deadline) - now;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)} title={`${formatDateTime(deadline)} (${blindBidAddress ? "chain time" : "preview time"})`}>
      <Clock className="size-3.5 text-muted-foreground" />
      {remaining === undefined ? (
        <span className="text-muted-foreground">{blindBidAddress ? "Syncing chain time…" : "Loading preview time…"}</span>
      ) : remaining > 0 ? (
        <span>
          {label} <span className="font-medium tabular-nums">{formatDuration(remaining)}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">{passedLabel}</span>
      )}
    </div>
  );
}

export function TimeNote() {
  if (!blindBidAddress) {
    return (
      <p className="text-xs text-muted-foreground">
        Preview dates use your device clock and your time zone ({localTimeZone()}). Deadlines will be enforced by the contract after deployment.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Countdowns follow the latest PortaldotV3 block timestamp; dates are shown in your time zone ({localTimeZone()}).
      Deadlines are enforced by the contract.
    </p>
  );
}
