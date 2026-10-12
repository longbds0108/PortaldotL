"use client";

import { useReadContract } from "wagmi";
import { TxStatus } from "@/components/tx-status";
import { Button } from "@/components/ui/button";
import { blindBidAddress, blindBidMarketAbi, type Bid } from "@/lib/contracts";
import { formatNativeWei } from "@/lib/format";
import { useBlindBidTx } from "@/lib/hooks";

export function WithdrawBondButton({ tenderId, bid, onDone }: { tenderId: bigint; bid: Bid; onDone?: () => void }) {
  const tx = useBlindBidTx();
  if (!bid.revealed || bid.bond === 0n) return null;
  if (bid.bondWithdrawn) return <p className="text-sm text-muted-foreground">Bond of {formatNativeWei(bid.bond)} withdrawn.</p>;
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
        Withdraw bond ({formatNativeWei(bid.bond)})
      </Button>
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}

export function ClaimForfeitsButton({ tenderId }: { tenderId: bigint }) {
  const tx = useBlindBidTx();
  const { data: amount, refetch } = useReadContract({
    address: blindBidAddress,
    abi: blindBidMarketAbi,
    functionName: "forfeitedBonds",
    args: [tenderId],
    query: { enabled: !!blindBidAddress, refetchInterval: 15_000 },
  });
  // After a successful claim the claimable amount refetches to 0; keep the confirmation visible.
  if (!amount) return tx.status === "success" ? <TxStatus status={tx.status} hash={tx.hash} /> : null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Bonds from bids that were not revealed in time are claimable by you: {formatNativeWei(amount)}.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={tx.busy}
        onClick={async () => {
          if (await tx.send("claimForfeitedBonds", [tenderId])) void refetch();
        }}
      >
        Claim forfeited bonds
      </Button>
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}
