"use client";

import { TxStatus } from "@/components/tx-status";
import { Button } from "@/components/ui/button";
import { forfeitedBonds, type Bid } from "@/lib/contracts";
import { formatNativeAmount } from "@/lib/format";
import { useBlindBidTx, useChainNow, useTender } from "@/lib/hooks";

export function WithdrawBondButton({ tenderId, bid, onDone }: { tenderId: bigint; bid: Bid; onDone?: () => void }) {
  const tx = useBlindBidTx();
  if (!bid.revealed || bid.bond === 0n) return null;
  if (bid.bondWithdrawn) return <p className="text-sm text-muted-foreground">Bond of {formatNativeAmount(bid.bond)} withdrawn.</p>;
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
        Withdraw bond ({formatNativeAmount(bid.bond)})
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
  // Same rule as the contract's sweepForfeitedBonds: bond × unrevealed bids, once, after the reveal deadline.
  const amount = row ? forfeitedBonds(row.tender, now) : 0n;
  // After a successful claim the claimable amount refetches to 0; keep the confirmation visible.
  if (!amount) return tx.status === "success" ? <TxStatus status={tx.status} hash={tx.hash} /> : null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {formatNativeAmount(amount)} in bonds from bids not revealed in time goes to the Plinths treasury — not to the buyer.
        Anyone can send it.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={tx.busy}
        onClick={async () => {
          if (await tx.send("sweepForfeitedBonds", [tenderId])) void refetch();
        }}
      >
        Send forfeited bonds to treasury
      </Button>
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}
