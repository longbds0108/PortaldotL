"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { Hash } from "viem";
import { ChainReference } from "@/components/chain-reference";
import { useT } from "@/components/lang-provider";
import type { Text } from "@/lib/i18n";
import type { TxStatus as Status } from "@/lib/hooks";
import { NETWORK_NAME } from "@/lib/network";

const TEXT: Partial<Record<Status, Text>> = {
  simulating: ["Checking transaction…", "Đang kiểm tra giao dịch…"],
  signing: ["Confirm in your wallet…", "Hãy xác nhận trong ví…"],
  confirming: ["Waiting for confirmation…", "Đang chờ xác nhận…"],
  success: [`Confirmed on ${NETWORK_NAME}.`, `Đã xác nhận trên ${NETWORK_NAME}.`],
};

export function TxStatus({ status, hash, error }: { status: Status; hash?: Hash; error?: string }) {
  const t = useT();
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <p className="flex items-start gap-2 text-sm text-destructive">
        <XCircle className="mt-0.5 size-4 shrink-0" /> {error}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {status === "success" ? <CheckCircle2 className="size-4 text-success" /> : <Loader2 className="size-4 animate-spin" />}
      {TEXT[status] && t(TEXT[status])}
      {hash && <ChainReference type="tx" value={hash} />}
    </p>
  );
}
