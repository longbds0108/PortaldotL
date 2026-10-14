"use client";

import { ArrowRight, Lock, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { BidRiskNotice } from "@/components/bid-risk-notice";
import { SweepForfeitsButton, WithdrawBondButton } from "@/components/bond-actions";
import { BuyerHistory } from "@/components/buyer-history";
import { Countdown, TimeNote } from "@/components/countdown";
import { ChainReference } from "@/components/chain-reference";
import { OnchainTimeline } from "@/components/onchain-timeline";
import { PhaseStepper } from "@/components/phase-stepper";
import { RevealPanel } from "@/components/reveal-panel";
import { StateBadge } from "@/components/state-badge";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenderState } from "@/lib/contracts";
import { formatBudget, formatDateTime, formatNativeAmount, shortHash } from "@/lib/format";
import { useBids, useBlindBidTx, type TenderRow } from "@/lib/hooks";
import type { TenderMetadata } from "@/lib/metadata";

export default function TenderDetailPage() {
  return <TenderShell>{(ctx) => <TenderDetail {...ctx} />}</TenderShell>;
}

function TenderDetail({ row, meta, refetch }: { row: TenderRow; meta?: TenderMetadata; refetch: () => void }) {
  const { id, tender, state } = row;
  const { address } = useAccount();
  const bids = useBids(id);
  const isBuyer = !!address && address.toLowerCase() === tender.buyer.toLowerCase();
  const myBid = bids.rows.find((b) => b.bidder.toLowerCase() === address?.toLowerCase())?.bid;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{meta?.category ?? "—"}</Badge>
          <StateBadge state={state} />
          <span className="text-xs text-muted-foreground">Tender #{id.toString()}</span>
        </div>
        <h1 className="title-sheen text-[clamp(2rem,5vw,3.4rem)]">{meta?.title ?? `Tender #${id}`}</h1>
        <p className="text-sm text-muted-foreground">
          Published by {meta?.buyerName ? `${meta.buyerName} · ` : ""}
          <ChainReference type="address" value={tender.buyer} />
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <PhaseStepper tender={tender} state={state} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scope of work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <p className="whitespace-pre-wrap">{meta?.description ?? "Loading…"}</p>
              {meta?.eligibility && (
                <div>
                  <h4 className="mb-1 font-medium">Eligibility</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{meta.eligibility}</p>
                </div>
              )}
              {meta?.criteria && (
                <div>
                  <h4 className="mb-1 font-medium">Evaluation criteria</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{meta.criteria}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sealed bids</CardTitle>
              <CardDescription>
                Only hashes are on-chain until the reveal window. Amounts are shown from the Evaluation phase on.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bids.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bids yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {bids.rows.map(({ bidder, bid }) => (
                    <li key={bidder} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <ChainReference type="address" value={bidder} />
                      <span className="font-mono text-xs text-muted-foreground" title={bid.commitment}>
                        {shortHash(bid.commitment)}
                      </span>
                      {bid.revealed ? (
                        <Badge variant="success">Revealed</Badge>
                      ) : (
                        <Badge variant="muted">
                          <Lock className="size-3" /> Sealed
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>On-chain timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <OnchainTimeline tenderId={id} tender={tender} bids={bids.rows} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-4 pt-5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Expected budget</p>
                <p className="text-[1.55rem] font-normal tracking-[-0.04em] tabular-nums">{formatBudget(tender.budgetMin, tender.budgetMax)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Bids</p>
                  <p className="flex items-center gap-1 font-medium">
                    <Users className="size-3.5" /> {tender.bidCount}
                    {state !== TenderState.Open && <span className="text-muted-foreground">({tender.revealedCount} revealed)</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bid bond</p>
                  <p className="font-medium">{tender.bidBond > 0n ? formatNativeAmount(tender.bidBond) : "None"}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Submission deadline</p>
                <p>{formatDateTime(tender.submissionDeadline)}</p>
                {state === TenderState.Open && <Countdown deadline={tender.submissionDeadline} label="Closes in" />}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Reveal deadline</p>
                <p>{formatDateTime(tender.revealDeadline)}</p>
                {state === TenderState.Reveal && <Countdown deadline={tender.revealDeadline} label="Reveal ends in" />}
              </div>
              <TimeNote />
              <p className="flex items-start gap-2 well rounded-[12px] p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Bid amounts remain confidential until the
                submission deadline — not even the buyer can read them.
              </p>
            </CardContent>
          </Card>

          {state === TenderState.Open && !isBuyer && <BidRiskNotice tender={tender} />}
          <Actions row={row} isBuyer={isBuyer} myBid={myBid} onChange={() => { refetch(); void bids.refetch(); }} />
          <BuyerHistory buyer={tender.buyer} />
        </div>
      </div>
    </div>
  );
}

function Actions({
  row,
  isBuyer,
  myBid,
  onChange,
}: {
  row: TenderRow;
  isBuyer: boolean;
  myBid?: import("@/lib/contracts").Bid;
  onChange: () => void;
}) {
  const { id, tender, state } = row;
  const { isConnected } = useAccount();
  const cancelTx = useBlindBidTx();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const finished = state === TenderState.Evaluation || state === TenderState.Awarded || state === TenderState.Failed;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isBuyer ? "Buyer actions" : "Take part"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === TenderState.Open && !isBuyer && (
          <Button asChild className="w-full">
            <Link href={`/tenders/${id}/bid`}>
              {myBid ? "Update sealed bid" : "Submit sealed bid"} <ArrowRight />
            </Link>
          </Button>
        )}
        {state === TenderState.Open && isBuyer && tender.bidCount === 0 && (
          <div className="space-y-2">
            {confirmCancel ? (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm">Cancel this tender? This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelTx.busy}
                    onClick={async () => {
                      if (await cancelTx.send("cancel", [id])) onChange();
                    }}
                  >
                    Yes, cancel tender
                  </Button>
                  <Button variant="ghost" size="sm" disabled={cancelTx.busy} onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setConfirmCancel(true)}>
                Cancel tender
              </Button>
            )}
            <TxStatus status={cancelTx.status} hash={cancelTx.hash} error={cancelTx.error} />
          </div>
        )}
        {state === TenderState.Open && isBuyer && tender.bidCount > 0 && (
          <p className="text-sm text-muted-foreground">Bidding is in progress. Bids can be compared after the reveal window.</p>
        )}

        {state === TenderState.Reveal && myBid && !myBid.revealed && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Reveal your bid before the deadline</p>
            <p className="text-xs text-muted-foreground">Unrevealed bids are excluded{tender.bidBond > 0n ? " and their bond is forfeited" : ""}.</p>
            <RevealPanel tenderId={id} bid={myBid} onRevealed={onChange} />
          </div>
        )}
        {state === TenderState.Reveal && myBid?.revealed && <p className="text-sm text-success">Your bid is revealed.</p>}
        {state === TenderState.Reveal && !myBid && <p className="text-sm text-muted-foreground">Submissions are closed. Bidders are revealing.</p>}

        {state === TenderState.Evaluation && isBuyer && (
          <Button asChild className="w-full">
            <Link href={`/tenders/${id}/evaluate`}>
              Evaluate bids <ArrowRight />
            </Link>
          </Button>
        )}
        {finished && (
          <Button asChild variant={state === TenderState.Evaluation && isBuyer ? "outline" : "default"} className="w-full">
            <Link href={`/tenders/${id}/results`}>
              {state === TenderState.Awarded ? "View results & proof" : "View process & status"} <ArrowRight />
            </Link>
          </Button>
        )}
        {state === TenderState.Cancelled && <p className="text-sm text-muted-foreground">This tender was cancelled by the buyer.</p>}

        {myBid && <WithdrawBondButton tenderId={id} bid={myBid} onDone={onChange} />}
        {isConnected && <SweepForfeitsButton tenderId={id} />}
        {!isConnected && <p className="text-xs text-muted-foreground">Connect a wallet to bid or manage this tender.</p>}
      </CardContent>
    </Card>
  );
}
