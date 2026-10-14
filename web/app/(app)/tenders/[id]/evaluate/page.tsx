"use client";

import { AlertTriangle, Download, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";
import { ChainReference } from "@/components/chain-reference";
import { WalletGate } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { TenderState, pricesVisible } from "@/lib/contracts";
import { decryptDocument, encryptedEnvelopeSchema } from "@/lib/crypto";
import { formatBudget, formatTokenAmount } from "@/lib/format";
import { describeError, useBids, useBlindBidTx, type BidRow, type TenderRow } from "@/lib/hooks";
import { fetchJson, uploadJson } from "@/lib/ipfs";
import type { AwardReason, TenderMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export default function EvaluatePage() {
  return (
    <TenderShell>
      {({ row, meta }) => (
        <>
          <PageHeader
            eyebrow="Buyer · evaluation"
            title="Evaluation"
            description={meta?.title ? `${meta.title} · budget ${formatBudget(row.tender.budgetMin, row.tender.budgetMax)}` : undefined}
          />
          <WalletGate message="Connect the buyer wallet to evaluate.">
            <EvaluateGuard row={row} meta={meta} />
          </WalletGate>
        </>
      )}
    </TenderShell>
  );
}

function EvaluateGuard({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { address } = useAccount();
  if (address?.toLowerCase() !== row.tender.buyer.toLowerCase()) {
    return <Notice>Only the buyer of this tender can evaluate bids.</Notice>;
  }
  if (row.state !== TenderState.Evaluation) {
    return (
      <Notice>
        Evaluation is available only after the reveal deadline and before an award. Current phase does not allow it.{" "}
        <Link className="underline" href={`/tenders/${row.id}`}>Back to tender</Link>
      </Notice>
    );
  }
  return <Evaluation row={row} meta={meta} />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Alert variant="warning">
      <AlertTriangle />
      <span>{children}</span>
    </Alert>
  );
}

function Evaluation({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { id, tender, state } = row;
  const router = useRouter();
  const bids = useBids(id);
  const tx = useBlindBidTx();
  const [winner, setWinner] = useState<Address>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);

  // Guard again at render time: amounts only in Evaluation/Awarded.
  const show = pricesVisible(state);
  const revealed = bids.rows.filter((b) => b.bid.revealed).sort((a, b) => (a.bid.amount < b.bid.amount ? -1 : 1));
  const unrevealed = bids.rows.filter((b) => !b.bid.revealed);
  const lowest = revealed[0]?.bid.amount;

  async function award() {
    setError(undefined);
    if (!winner) return setError("Select a winning bid.");
    if (reason.trim().length < 10) return setError("Explain the decision (at least 10 characters). It will be public.");
    const doc: AwardReason = {
      version: 1,
      tenderId: id.toString(),
      winner,
      reason: reason.trim(),
      decidedAt: new Date().toISOString(),
    };
    setUploading(true);
    let reasonURI: string;
    try {
      reasonURI = await uploadJson(doc, "award-reason.json");
    } catch (e) {
      setError(describeError(e));
      return;
    } finally {
      setUploading(false);
    }
    if (await tx.send("award", [id, winner, reasonURI])) router.push(`/tenders/${id}/results`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Revealed bids ({revealed.length})</CardTitle>
          <CardDescription>
            Sorted by price. Documents are decrypted in your browser with the key each bidder published at reveal.
            {meta?.criteria ? ` Criteria: ${meta.criteria}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bids.isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y border-overlay/[0.07] bg-overlay/[0.025] text-left text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">Select</th>
                    <th className="px-2 py-2 font-medium">Bidder</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Budget fit</th>
                    <th className="px-5 py-2 font-medium">Proposal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revealed.map((b) => (
                    <tr key={b.bidder} className={cn(winner === b.bidder && "bg-accent/60")}>
                      <td className="px-5 py-3">
                        <input
                          type="radio"
                          name="winner"
                          aria-label={`Select ${b.bidder}`}
                          checked={winner === b.bidder}
                          onChange={() => setWinner(b.bidder)}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <ChainReference type="address" value={b.bidder} />
                      </td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums">
                        {show ? formatTokenAmount(b.bid.amount) : "—"}
                        {b.bid.amount === lowest && <Badge variant="success" className="ml-2">Lowest</Badge>}
                      </td>
                      <td className="px-2 py-3">
                        {b.bid.amount < tender.budgetMin ? (
                          <Badge variant="warning">Below range</Badge>
                        ) : b.bid.amount > tender.budgetMax ? (
                          <Badge variant="destructive">Over budget</Badge>
                        ) : (
                          <Badge variant="muted">Within budget</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <DecryptButton row={b} />
                      </td>
                    </tr>
                  ))}
                  {unrevealed.map((b) => (
                    <tr key={b.bidder} className="text-muted-foreground">
                      <td className="px-5 py-3">—</td>
                      <td className="px-2 py-3">
                        <ChainReference type="address" value={b.bidder} />
                      </td>
                      <td className="px-2 py-3 text-right" colSpan={2}>
                        <Badge variant="destructive">Not revealed — excluded</Badge>
                      </td>
                      <td className="px-5 py-3 text-xs">Document key never published</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" /> Award
          </CardTitle>
          <CardDescription>The winner and your justification are published on-chain/IPFS permanently.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for decision</Label>
            <Textarea
              id="reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lowest price among bids meeting the eligibility requirements; strongest technical approach…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" disabled={!winner || uploading || tx.busy} onClick={award}>
            {(uploading || tx.busy) && <Loader2 className="animate-spin" />}
            Award tender
          </Button>
          <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        </CardContent>
      </Card>
    </div>
  );
}

function DecryptButton({ row }: { row: BidRow }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [err, setErr] = useState<string>();
  async function run() {
    setState("busy");
    setErr(undefined);
    try {
      const envelope = encryptedEnvelopeSchema.parse(await fetchJson(row.bid.encryptedDocURI));
      const doc = await decryptDocument(envelope, row.bid.docKey as Hex);
      const url = URL.createObjectURL(new Blob([doc.bytes], { type: doc.type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not decrypt");
      setState("error");
    }
  }
  return (
    <div>
      <Button size="sm" variant="outline" onClick={run} disabled={state === "busy"}>
        {state === "busy" ? <Loader2 className="animate-spin" /> : <Download />} Decrypt
      </Button>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </div>
  );
}
