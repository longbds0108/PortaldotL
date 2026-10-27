"use client";

import { useT } from "@/components/lang-provider";
import { TxStatus } from "@/components/tx-status";
import { Button } from "@/components/ui/button";
import { forfeitedBonds, type Bid } from "@/lib/contracts";
import { formatNativeAmount } from "@/lib/format";
import { useBlindBidTx, useChainNow, useTender } from "@/lib/hooks";

export function WithdrawBondButton({ tenderId, bid, onDone }: { tenderId: bigint; bid: Bid; onDone?: () => void }) {
  const tx = useBlindBidTx();
  const t = useT();
  if (!bid.revealed || bid.bond === 0n) return null;
  if (bid.bondWithdrawn)
    return (
      <p className="text-sm text-muted-foreground">
        {t(`Bond of ${formatNativeAmount(bid.bond)} withdrawn.`, `Đã rút tiền bảo đảm ${formatNativeAmount(bid.bond)}.`)}
      </p>
    );
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={tx.busy || tx.status === "success"}
        onClick={async () => {
          if (await tx.send("withdrawBond", [tenderId])) onDone?.();
        }}
      >
        {t("Withdraw bond", "Rút tiền bảo đảm")} ({formatNativeAmount(bid.bond)})
      </Button>
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}

/** Forfeited bonds always go to the immutable treasury — never the buyer. Anyone may trigger the transfer. */
export function SweepForfeitsButton({ tenderId }: { tenderId: bigint }) {
  const tx = useBlindBidTx();
  const { row, refetch } = useTender(tenderId);
  const now = useChainNow();
  const t = useT();
  // Same rule as the contract's sweepForfeitedBonds: bond × unrevealed bids, once, after the reveal deadline.
  const amount = row ? forfeitedBonds(row.tender, now) : 0n;
  // After a successful claim the claimable amount refetches to 0; keep the confirmation visible.
  if (!amount) return tx.status === "success" ? <TxStatus status={tx.status} hash={tx.hash} /> : null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t(
          `${formatNativeAmount(amount)} in bonds from bids not revealed in time goes to the Plinths treasury — not to the buyer. Anyone can send it.`,
          `${formatNativeAmount(amount)} tiền bảo đảm của các hồ sơ không công bố đúng hạn sẽ chuyển về treasury của Plinths — không về bên mời thầu. Ai cũng có thể thực hiện việc chuyển.`,
        )}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={tx.busy}
        onClick={async () => {
          if (await tx.send("sweepForfeitedBonds", [tenderId])) void refetch();
        }}
      >
        {t("Send forfeited bonds to treasury", "Chuyển tiền bảo đảm bị phạt về treasury")}
      </Button>
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}
