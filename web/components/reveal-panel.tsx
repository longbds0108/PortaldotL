"use client";

import { CheckCircle2, FileUp, KeyRound, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { useAccount } from "wagmi";
import { TxStatus } from "@/components/tx-status";
import { Button } from "@/components/ui/button";
import { blindBidAddress, type Bid } from "@/lib/contracts";
import { verifyCommitment } from "@/lib/commitment";
import { useBlindBidTx } from "@/lib/hooks";
import { entrySecrets, getEntry, parseBackup, saveEntries, type VaultEntry } from "@/lib/salt-vault";
import { chain } from "@/lib/wagmi";

/**
 * Reveals the connected bidder's sealed bid. Secrets come from the local vault or an imported backup
 * file, are checked against the on-chain commitment locally first, and only then sent in revealBid.
 * The amount is intentionally not displayed here (prices are shown only from Evaluation on).
 */
export function RevealPanel({ tenderId, bid, onRevealed }: { tenderId: bigint; bid: Bid; onRevealed?: (txHash: Hash) => void }) {
  const { address } = useAccount();
  const tx = useBlindBidTx();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entry, setEntry] = useState<VaultEntry>();
  const [importError, setImportError] = useState<string>();

  useEffect(() => {
    if (!address || !blindBidAddress) return;
    setEntry(getEntry({ chainId: chain.id, contract: blindBidAddress, tenderId, bidder: address }));
  }, [address, tenderId]);

  const matches =
    entry && address
      ? verifyCommitment({ tenderId, bidder: address, ...entrySecrets(entry) }, bid.commitment)
      : undefined;

  async function onImport(file: File) {
    setImportError(undefined);
    try {
      const entries = parseBackup(await file.text());
      const mine = entries.find(
        (e) =>
          e.chainId === chain.id &&
          e.contract === blindBidAddress &&
          BigInt(e.tenderId) === tenderId &&
          e.bidder.toLowerCase() === address?.toLowerCase(),
      );
      if (!mine) throw new Error("This backup does not contain a bid for this tender from the connected wallet.");
      saveEntries([mine]);
      setEntry(mine);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not read backup file");
    }
  }

  async function reveal() {
    if (!entry) return;
    const { amount18, salt, docKey } = entrySecrets(entry);
    const receipt = await tx.send("revealBid", [tenderId, amount18, salt, docKey]);
    if (receipt) onRevealed?.(receipt.transactionHash);
  }

  return (
    <div className="space-y-3">
      {!entry ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="size-4" /> No saved secrets for this bid in this browser. Import your backup file.
        </p>
      ) : matches ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Backup found and matches your sealed commitment.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="size-4" /> Saved secrets do not match your on-chain commitment (did you update the bid
          later?). Import the latest backup.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reveal} disabled={!matches || tx.busy || tx.status === "success"}>
          Reveal bid
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp /> Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </div>
      {importError && <p className="text-sm text-destructive">{importError}</p>}
      <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
    </div>
  );
}
