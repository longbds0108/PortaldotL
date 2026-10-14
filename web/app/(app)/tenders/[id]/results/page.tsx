"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, ShieldCheck, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Hex } from "viem";
import { ChainReference } from "@/components/chain-reference";
import { OnchainTimeline } from "@/components/onchain-timeline";
import { PageHeader } from "@/components/page-header";
import { StateBadge } from "@/components/state-badge";
import { TenderShell } from "@/components/tender-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeCommitment } from "@/lib/commitment";
import { TenderState, pricesVisible, type Bid, type Tender } from "@/lib/contracts";
import { formatBudget, formatDateTime, formatTokenAmount, shortHash } from "@/lib/format";
import { useBids, type BidRow, type TenderRow } from "@/lib/hooks";
import { fetchJson } from "@/lib/ipfs";
import { awardReasonSchema, type TenderMetadata } from "@/lib/metadata";

export default function ResultsPage() {
  return <TenderShell>{(ctx) => <Results {...ctx} />}</TenderShell>;
}

type Verdict = { ok: boolean; checks: { label: string; ok: boolean }[] };

/** Recomputes the commitment in the browser from the revealed (public) opening. */
function verifyBid(tenderId: bigint, tender: Tender, row: BidRow): Verdict {
  const { bid, bidder } = row;
  const recomputed = computeCommitment({
    tenderId,
    bidder,
    amount14: bid.amount,
    salt: bid.salt as Hex,
    docKey: bid.docKey as Hex,
  });
  const checks = [
    { label: "Revealed amount, salt and document key hash to the sealed commitment", ok: recomputed.toLowerCase() === bid.commitment.toLowerCase() },
    { label: "Commitment was last set before the submission deadline", ok: bid.committedAt < tender.submissionDeadline },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function Results({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { id, tender, state } = row;
  const bids = useBids(id);
  const show = pricesVisible(state);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  const reason = useQuery({
    queryKey: ["award-reason", tender.reasonURI],
    queryFn: async () => awardReasonSchema.parse(await fetchJson(tender.reasonURI)),
    enabled: !!tender.reasonURI,
    staleTime: Infinity,
  });

  const winnerBid = bids.rows.find((b) => b.bidder.toLowerCase() === tender.winner.toLowerCase())?.bid;
  const revealedRows = bids.rows.filter((b) => b.bid.revealed);
  const verifyAll = () =>
    setVerdicts(Object.fromEntries(revealedRows.map((b) => [b.bidder, verifyBid(id, tender, b)])));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Results · tender #${id}`}
        title={meta?.title ?? `Tender #${id}`}
        description={`Results and proof of process · budget ${formatBudget(tender.budgetMin, tender.budgetMax)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/tenders/${id}`}>Tender details</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
              <Trophy className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{state === TenderState.Awarded ? "Awarded" : "Outcome"}</p>
                <StateBadge state={state} />
              </div>
              {state === TenderState.Awarded ? (
                <p className="text-sm text-muted-foreground">
                  Winner <ChainReference type="address" value={tender.winner} />
                  {winnerBid && show && <> · <span className="font-semibold text-foreground">{formatTokenAmount(winnerBid.amount)}</span></>}
                </p>
              ) : state === TenderState.Failed ? (
                <p className="text-sm text-muted-foreground">No bid was revealed in time — the tender failed.</p>
              ) : state === TenderState.Evaluation ? (
                <p className="text-sm text-muted-foreground">The buyer is evaluating revealed bids.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Results are published after the reveal window.</p>
              )}
            </div>
          </div>
          {tender.awardedBlock > 0n && <p className="text-xs text-muted-foreground">Decided in block {tender.awardedBlock.toString()}</p>}
        </CardContent>
        {tender.reasonURI && (
          <CardContent className="border-t pt-4 text-sm">
            <p className="mb-1 font-medium">Buyer&apos;s justification</p>
            {reason.data ? (
              <p className="whitespace-pre-wrap text-muted-foreground">{reason.data.reason}</p>
            ) : reason.error ? (
              <p className="text-destructive">Could not load justification.</p>
            ) : (
              <p className="text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Proof of process
            </CardTitle>
            <CardDescription>
              Each bid&apos;s commitment was fixed on-chain before the deadline. Verify recomputes the hash in your browser
              from the revealed values — no trust in this website or the buyer needed.
            </CardDescription>
          </div>
          {revealedRows.length > 0 && show && (
            <Button variant="outline" onClick={verifyAll}>
              Verify all
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-y border-overlay/[0.07] bg-overlay/[0.025] text-left text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Bidder</th>
                  <th className="px-2 py-2 font-medium">Commitment</th>
                  <th className="px-2 py-2 font-medium">Sealed at</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bids.rows.map((b) => (
                  <BidProofRow
                    key={b.bidder}
                    row={b}
                    show={show}
                    isWinner={b.bidder.toLowerCase() === tender.winner.toLowerCase()}
                    verdict={verdicts[b.bidder]}
                    onVerify={() => setVerdicts((v) => ({ ...v, [b.bidder]: verifyBid(id, tender, b) }))}
                  />
                ))}
                {bids.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">No bids were submitted.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>On-chain timeline</CardTitle>
          <CardDescription>
            Submission deadline {formatDateTime(tender.submissionDeadline)} · reveal deadline {formatDateTime(tender.revealDeadline)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnchainTimeline tenderId={id} tender={tender} bids={bids.rows} />
        </CardContent>
      </Card>
    </div>
  );
}

function BidProofRow({
  row,
  show,
  isWinner,
  verdict,
  onVerify,
}: {
  row: BidRow;
  show: boolean;
  isWinner: boolean;
  verdict?: Verdict;
  onVerify: () => void;
}) {
  const bid: Bid = row.bid;
  return (
    <tr className="align-top">
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChainReference type="address" value={row.bidder} />
          {isWinner && <Badge>Winner</Badge>}
        </div>
      </td>
      <td className="px-2 py-3 font-mono text-xs" title={bid.commitment}>
        {shortHash(bid.commitment)}
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground">{formatDateTime(bid.committedAt)}</td>
      <td className="px-2 py-3 text-right tabular-nums">
        {!bid.revealed ? (
          <Badge variant="muted">
            <Lock className="size-3" /> Not revealed
          </Badge>
        ) : show ? (
          <span className="font-semibold">{formatTokenAmount(bid.amount)}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-5 py-3">
        {!bid.revealed || !show ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : verdict ? (
          <ul className="space-y-1">
            {verdict.checks.map((c) => (
              <li key={c.label} className={`flex items-start gap-1.5 text-xs ${c.ok ? "text-success" : "text-destructive"}`}>
                {c.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <XCircle className="mt-px size-3.5 shrink-0" />}
                {c.label}
              </li>
            ))}
          </ul>
        ) : (
          <Button size="sm" variant="outline" onClick={onVerify}>
            Verify
          </Button>
        )}
      </td>
    </tr>
  );
}
