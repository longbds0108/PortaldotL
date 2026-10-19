"use client";

import { ArrowLeft, Ban, CheckCircle2, ExternalLink, Eye, Gavel, Loader2, MessageSquare, Scale } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { TxStatus } from "@/components/tx-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { uriToDigest } from "@/lib/cid";
import { DisputeStatus, STATUS_LABEL, TRACK_LABEL, isClosed, partiesOf, reasonLabel, reasonOf, targetHref, targetLabel, verifyTxHashes } from "@/lib/disputes";
import { useArbiter, useDispute, useDisputeTx, useEngineChecks, useEvidence, useTargetContext, type DisputePost, type DisputeView, type TargetContext } from "@/lib/dispute-hooks";
import { formatDateTime, shortHash } from "@/lib/format";
import { uploadJson } from "@/lib/ipfs";
import { useTenderIdParam } from "@/lib/use-tender-id";
import { cn } from "@/lib/utils";
import { AssistantCard, EngineCard, TrackBadge, TrackCard } from "./engine";
import { AddressLine, DisputeStatusBadge, EMPTY_DRAFT, EvidenceDocument, EvidenceFields, TargetName, draftProblem, draftToEvidence, type EvidenceDraft } from "./parts";

export function DisputeDetail() {
  const id = useTenderIdParam();
  const { row, notFound, isLoading, refetch } = useDispute(id);
  if (id === undefined || notFound) {
    return (
      <>
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Dispute not found.</CardContent>
        </Card>
      </>
    );
  }
  if (isLoading || !row) return <Skeleton className="h-96" />;
  return <Dispute row={row} onChange={refetch} />;
}

function Dispute({ row, onChange }: { row: DisputeView; onChange: () => void }) {
  const { core } = row;
  const { address } = useAccount();
  const arbiter = useArbiter();
  const ctx = useTargetContext(core.kind, core.targetId);
  const label = targetLabel(core.kind, core.targetId);
  const opening = row.posts.find((p) => p.type === "opened");
  const openingDoc = useEvidence(opening?.evidenceUri || undefined);
  const isArbiter = !!address && !!arbiter && address.toLowerCase() === arbiter.toLowerCase();
  const roles = (who: string) =>
    partiesOf(who as `0x${string}`, { opener: core.opener, arbiter, organizer: ctx.data?.organizer, bidders: ctx.data?.bidders ?? [], kind: core.kind });
  const decision = [...row.posts].reverse().find((p) => p.type === "status" && isClosed(p.status));
  const reason = reasonOf(core.reason);
  const engineChecks = useEngineChecks(core.kind, ctx.data);

  // Evidence check summary across every cited hash in every post that has loaded.
  const checks = openingDoc.data && ctx.data ? verifyTxHashes(openingDoc.data.txHashes, ctx.data.events) : [];

  return (
    <>
      <BackLink />
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">
            Dispute #{row.id.toString()} · {label} · {reasonLabel(core.reason)}
          </p>
          <h1 className="title-sheen mt-3 max-w-[900px] text-[clamp(1.8rem,4vw,3rem)]">{openingDoc.data?.title ?? reasonLabel(core.reason)}</h1>
        </div>
        <div className="flex flex-wrap gap-2 self-start xl:self-end">
          {reason && <TrackBadge track={reason.track} className="px-3 py-1.5 text-[0.74rem]" />}
          <DisputeStatusBadge status={core.status} className="px-3 py-1.5 text-[0.74rem]" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {decision && decision.type === "status" && (
            <Card className={cn(decision.status === DisputeStatus.Resolved ? "border-[rgba(79,209,197,.3)]" : "")}>
              <CardContent className="space-y-3 pt-6">
                <p className="eyebrow">Decision</p>
                <p className="flex items-center gap-2 text-[1.15rem] font-medium text-foreground">
                  {decision.status === DisputeStatus.Resolved ? <CheckCircle2 className="size-5 text-success-fg" /> : <Ban className="size-5 text-muted-foreground" />}
                  {decision.status === DisputeStatus.Resolved ? "Resolved — the concern was upheld" : "Rejected — the concern was not upheld"}
                </p>
                <EvidenceDocument uri={decision.evidenceUri} events={ctx.data?.events} targetLabel={label} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-5 pt-6">
              <div>
                <p className="eyebrow">Dispute timeline</p>
                <h2 className="mt-2 text-[1.2rem] font-medium text-foreground">History & discussion</h2>
              </div>
              <ol className="relative space-y-6 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-overlay/10">
                {row.posts.map((p) => (
                  <TimelineItem key={p.txHash + p.type} post={p} roles={roles(p.author)} events={ctx.data?.events} label={label} />
                ))}
              </ol>
            </CardContent>
          </Card>

          <EngineCard checks={engineChecks} loading={ctx.isLoading} focus={reason && "check" in reason ? reason.check : undefined} />

          <AssistantCard disputeId={row.id} />

          {!isClosed(core.status) && <ResponseForm id={row.id} ctx={ctx.data} label={label} roles={address ? roles(address) : []} onDone={onChange} />}
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          {reason && <TrackCard track={reason.track} />}
          <Card>
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="eyebrow">Summary</p>
              <Detail label="Status">{STATUS_LABEL[core.status]}</Detail>
              <Detail label="Reason">{reasonLabel(core.reason)}</Detail>
              <Detail label="About">
                <Link href={targetHref(core.kind, core.targetId)} className="inline-flex items-center gap-1 text-link hover:underline">
                  <TargetName kind={core.kind} targetId={core.targetId} ctx={ctx.data} /> <ExternalLink className="size-3" />
                </Link>
              </Detail>
              <Detail label="Opened by">
                <AddressLine address={core.opener} />
              </Detail>
              <Detail label="Opened">{row.openedAt > 0n ? formatDateTime(row.openedAt) : `block #${row.openedBlock}`}</Detail>
              <Detail label="Decided by">{reason ? TRACK_LABEL[reason.track] : "—"}</Detail>
              <Detail label="Panel account">{arbiter ? <AddressLine address={arbiter} /> : "…"}</Detail>
              <Detail label="Evidence check">
                {!openingDoc.data || !ctx.data
                  ? "…"
                  : checks.length === 0
                    ? "No transactions cited"
                    : `${checks.filter((c) => c.ok).length} of ${checks.length} verified on-chain`}
              </Detail>
            </CardContent>
          </Card>
          {isArbiter && !isClosed(core.status) && <ArbiterPanel row={row} ctx={ctx.data} label={label} onDone={onChange} />}
        </div>
      </div>
    </>
  );
}

function TimelineItem({ post, roles, events, label }: { post: DisputePost; roles: ReturnType<typeof partiesOf>; events?: TargetContext["events"]; label: string }) {
  const icon =
    post.type === "opened" ? <Scale className="size-4" /> : post.type === "response" ? <MessageSquare className="size-4" /> : post.status === DisputeStatus.UnderReview ? <Eye className="size-4" /> : <Gavel className="size-4" />;
  const title =
    post.type === "opened"
      ? "Dispute opened"
      : post.type === "response"
        ? "Response"
        : post.status === DisputeStatus.UnderReview
          ? "Review started"
          : post.status === DisputeStatus.Resolved
            ? "Resolved"
            : "Rejected";
  return (
    <li className="relative flex gap-3">
      <span className="relative z-[1] grid size-8 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.3)] bg-background text-link">{icon}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem]">
          <span className="font-medium text-foreground">{title}</span>
          <AddressLine address={post.author} parties={roles} />
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {post.timestamp > 0n ? `${formatDateTime(post.timestamp)} · ` : ""}block #{post.blockNumber.toString()} ·{" "}
          <span className="font-mono" title={post.txHash}>
            {shortHash(post.txHash)}
          </span>
        </p>
        {post.evidenceUri && (
          <div className="well rounded-[12px] p-3.5">
            <EvidenceDocument uri={post.evidenceUri} events={events} targetLabel={label} />
          </div>
        )}
      </div>
    </li>
  );
}

/** Response & Discussion: anyone connected can add evidence while the dispute is not closed. */
function ResponseForm({ id, ctx, label, roles, onDone }: { id: bigint; ctx?: TargetContext; label: string; roles: ReturnType<typeof partiesOf>; onDone: () => void }) {
  const { address } = useAccount();
  const tx = useDisputeTx();
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const problem = draftProblem(draft);

  async function submit() {
    setError(undefined);
    if (problem) return setError(problem);
    try {
      setUploading(true);
      const uri = await uploadJson(draftToEvidence(draft, "response"), `dispute-${id}-response.json`);
      setUploading(false);
      if (await tx.send("respond", [id, uriToDigest(uri)])) {
        setDraft(EMPTY_DRAFT);
        onDone();
      }
    } catch (e) {
      setUploading(false);
      setError(e instanceof Error ? e.message : "Could not upload the evidence.");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="eyebrow">Response & discussion</p>
          <h2 className="mt-2 text-[1.2rem] font-medium text-foreground">Add a response</h2>
          <p className="mt-1 text-[0.78rem] text-muted-foreground">
            The organizer, bidders and anyone else can add context or evidence. It is published with your address
            {roles.length ? " and your role in this case" : ""}.
          </p>
        </div>
        {!address ? (
          <p className="text-sm text-muted-foreground">Connect your wallet to respond.</p>
        ) : (
          <>
            <EvidenceFields draft={draft} onChange={setDraft} events={ctx?.events} targetLabel={label} idPrefix="respond" textLabel="Your response" textPlaceholder="Add context, answer the claim, or point to more evidence." />
            <FieldError>{error}</FieldError>
            <Button disabled={!!problem || uploading || tx.busy} onClick={submit}>
              {(uploading || tx.busy) && <Loader2 className="animate-spin" />} {uploading ? "Uploading…" : "Post response"}
            </Button>
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Dispute Resolution: only the arbitration panel's account sees this. Closing needs a published decision. */
function ArbiterPanel({ row, ctx, label, onDone }: { row: DisputeView; ctx?: TargetContext; label: string; onDone: () => void }) {
  const tx = useDisputeTx();
  const track = reasonOf(row.core.reason)?.track;
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const problem = draftProblem(draft);

  async function close(status: DisputeStatus.Resolved | DisputeStatus.Rejected) {
    setError(undefined);
    if (problem) return setError(problem);
    try {
      setUploading(true);
      const uri = await uploadJson(draftToEvidence(draft, "decision"), `dispute-${row.id}-decision.json`);
      setUploading(false);
      if (await tx.send("setStatus", [row.id, status, uriToDigest(uri)])) onDone();
    } catch (e) {
      setUploading(false);
      setError(e instanceof Error ? e.message : "Could not upload the decision.");
    }
  }

  return (
    <Card className="border-[rgba(232,181,76,.3)]">
      <CardContent className="space-y-4 pt-5">
        <div>
          <p className="eyebrow">Arbitration panel</p>
          <h2 className="mt-2 text-[1.05rem] font-medium text-foreground">Record the outcome</h2>
          <p className="mt-1 text-[0.74rem] text-muted-foreground">
            {track === "engine"
              ? "Record what the Verification Engine shows. Your note and its reasoning are published and cannot be changed afterwards."
              : track === "parties"
                ? "Record how the parties settled it under their own agreement (Resolved), or close it as Rejected if it is out of scope."
                : "Publish your decision and its reasoning. It cannot be changed afterwards."}
          </p>
        </div>
        {row.core.status === DisputeStatus.Open && (
          <Button variant="outline" className="w-full" disabled={tx.busy} onClick={async () => (await tx.send("setStatus", [row.id, DisputeStatus.UnderReview, `0x${"0".repeat(64)}`])) && onDone()}>
            <Eye /> Start review
          </Button>
        )}
        <EvidenceFields draft={draft} onChange={setDraft} events={ctx?.events} targetLabel={label} idPrefix="decide" textLabel="Decision & reasoning" textPlaceholder="What you found, which rule applies, and the outcome." />
        <FieldError>{error}</FieldError>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!!problem || uploading || tx.busy} onClick={() => close(DisputeStatus.Resolved)}>
            {(uploading || tx.busy) && <Loader2 className="animate-spin" />} Resolve
          </Button>
          <Button variant="outline" disabled={!!problem || uploading || tx.busy} onClick={() => close(DisputeStatus.Rejected)}>
            Reject
          </Button>
        </div>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/disputes">
        <ArrowLeft /> Dispute Center
      </Link>
    </Button>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-overlay/[0.05] pb-3 last:border-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-foreground-soft">{children}</span>
    </div>
  );
}

