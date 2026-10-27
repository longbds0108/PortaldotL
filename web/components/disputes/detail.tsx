"use client";

import { ArrowLeft, Ban, CheckCircle2, ExternalLink, Eye, Gavel, Loader2, MessageSquare, Scale } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useLang, useT } from "@/components/lang-provider";
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
  const t = useT();
  if (id === undefined || notFound) {
    return (
      <>
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{t("Dispute not found.", "Không tìm thấy khiếu nại.")}</CardContent>
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
  const t = useT();
  const lang = useLang();
  const label = targetLabel(core.kind, core.targetId, t);
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
            {t("Dispute", "Khiếu nại")} #{row.id.toString()} · {label} · {reasonLabel(core.reason, t)}
          </p>
          <h1 className="title-sheen mt-3 max-w-[900px] text-[clamp(1.8rem,4vw,3rem)]">{openingDoc.data?.title ?? reasonLabel(core.reason, t)}</h1>
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
                <p className="eyebrow">{t("Decision", "Quyết định")}</p>
                <p className="flex items-center gap-2 text-[1.15rem] font-medium text-foreground">
                  {decision.status === DisputeStatus.Resolved ? <CheckCircle2 className="size-5 text-success-fg" /> : <Ban className="size-5 text-muted-foreground" />}
                  {decision.status === DisputeStatus.Resolved
                    ? t("Resolved — the concern was upheld", "Đã giải quyết — khiếu nại được chấp nhận")
                    : t("Rejected — the concern was not upheld", "Bị bác — khiếu nại không được chấp nhận")}
                </p>
                <EvidenceDocument uri={decision.evidenceUri} events={ctx.data?.events} targetLabel={label} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-5 pt-6">
              <div>
                <p className="eyebrow">{t("Dispute timeline", "Dòng thời gian khiếu nại")}</p>
                <h2 className="mt-2 text-[1.2rem] font-medium text-foreground">{t("History & discussion", "Lịch sử & thảo luận")}</h2>
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
              <p className="eyebrow">{t("Summary", "Tóm tắt")}</p>
              <Detail label={t("Status", "Trạng thái")}>{t(STATUS_LABEL[core.status])}</Detail>
              <Detail label={t("Reason", "Lý do")}>{reasonLabel(core.reason, t)}</Detail>
              <Detail label={t("About", "Về")}>
                <Link href={targetHref(core.kind, core.targetId)} className="inline-flex items-center gap-1 text-link hover:underline">
                  <TargetName kind={core.kind} targetId={core.targetId} ctx={ctx.data} /> <ExternalLink className="size-3" />
                </Link>
              </Detail>
              <Detail label={t("Opened by", "Mở bởi")}>
                <AddressLine address={core.opener} />
              </Detail>
              <Detail label={t("Opened", "Mở lúc")}>{row.openedAt > 0n ? formatDateTime(row.openedAt, lang) : `block #${row.openedBlock}`}</Detail>
              <Detail label={t("Decided by", "Quyết định bởi")}>{reason ? t(TRACK_LABEL[reason.track]) : "—"}</Detail>
              <Detail label={t("Panel account", "Tài khoản hội đồng")}>{arbiter ? <AddressLine address={arbiter} /> : "…"}</Detail>
              <Detail label={t("Evidence check", "Kiểm tra bằng chứng")}>
                {!openingDoc.data || !ctx.data
                  ? "…"
                  : checks.length === 0
                    ? t("No transactions cited", "Không dẫn giao dịch nào")
                    : t(
                        `${checks.filter((c) => c.ok).length} of ${checks.length} verified on-chain`,
                        `${checks.filter((c) => c.ok).length} / ${checks.length} đã xác minh on-chain`,
                      )}
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
  const t = useT();
  const lang = useLang();
  const title =
    post.type === "opened"
      ? t("Dispute opened", "Mở khiếu nại")
      : post.type === "response"
        ? t("Response", "Phản hồi")
        : post.status === DisputeStatus.UnderReview
          ? t("Review started", "Bắt đầu xem xét")
          : post.status === DisputeStatus.Resolved
            ? t("Resolved", "Đã giải quyết")
            : t("Rejected", "Bị bác");
  return (
    <li className="relative flex gap-3">
      <span className="relative z-[1] grid size-8 shrink-0 place-items-center rounded-full border border-[rgba(131,170,255,.3)] bg-background text-link">{icon}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem]">
          <span className="font-medium text-foreground">{title}</span>
          <AddressLine address={post.author} parties={roles} />
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {post.timestamp > 0n ? `${formatDateTime(post.timestamp, lang)} · ` : ""}block #{post.blockNumber.toString()} ·{" "}
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
  const t = useT();
  const problem = draftProblem(draft, t);

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
      setError(e instanceof Error ? e.message : t("Could not upload the evidence.", "Không tải lên được bằng chứng."));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="eyebrow">{t("Response & discussion", "Phản hồi & thảo luận")}</p>
          <h2 className="mt-2 text-[1.2rem] font-medium text-foreground">{t("Add a response", "Thêm phản hồi")}</h2>
          <p className="mt-1 text-[0.78rem] text-muted-foreground">
            {roles.length
              ? t(
                  "The organizer, bidders and anyone else can add context or evidence. It is published with your address and your role in this case.",
                  "Bên tổ chức, nhà thầu và bất kỳ ai cũng có thể bổ sung bối cảnh hoặc bằng chứng. Nội dung được công bố kèm địa chỉ và vai trò của bạn trong vụ việc.",
                )
              : t(
                  "The organizer, bidders and anyone else can add context or evidence. It is published with your address.",
                  "Bên tổ chức, nhà thầu và bất kỳ ai cũng có thể bổ sung bối cảnh hoặc bằng chứng. Nội dung được công bố kèm địa chỉ của bạn.",
                )}
          </p>
        </div>
        {!address ? (
          <p className="text-sm text-muted-foreground">{t("Connect your wallet to respond.", "Hãy kết nối ví để phản hồi.")}</p>
        ) : (
          <>
            <EvidenceFields
              draft={draft}
              onChange={setDraft}
              events={ctx?.events}
              targetLabel={label}
              idPrefix="respond"
              textLabel={t("Your response", "Phản hồi của bạn")}
              textPlaceholder={t("Add context, answer the claim, or point to more evidence.", "Bổ sung bối cảnh, trả lời khiếu nại, hoặc dẫn thêm bằng chứng.")}
            />
            <FieldError>{error}</FieldError>
            <Button disabled={!!problem || uploading || tx.busy} onClick={submit}>
              {(uploading || tx.busy) && <Loader2 className="animate-spin" />} {uploading ? t("Uploading…", "Đang tải lên…") : t("Post response", "Gửi phản hồi")}
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
  const t = useT();
  const problem = draftProblem(draft, t);

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
      setError(e instanceof Error ? e.message : t("Could not upload the decision.", "Không tải lên được quyết định."));
    }
  }

  return (
    <Card className="border-[rgba(232,181,76,.3)]">
      <CardContent className="space-y-4 pt-5">
        <div>
          <p className="eyebrow">{t("Arbitration panel", "Hội đồng trọng tài")}</p>
          <h2 className="mt-2 text-[1.05rem] font-medium text-foreground">{t("Record the outcome", "Ghi nhận kết quả")}</h2>
          <p className="mt-1 text-[0.74rem] text-muted-foreground">
            {track === "engine"
              ? t(
                  "Record what the Verification Engine shows. Your note and its reasoning are published and cannot be changed afterwards.",
                  "Ghi lại những gì Verification Engine cho thấy. Ghi chú và lập luận của bạn được công bố và không thể sửa về sau.",
                )
              : track === "parties"
                ? t(
                    "Record how the parties settled it under their own agreement (Resolved), or close it as Rejected if it is out of scope.",
                    "Ghi lại cách các bên giải quyết theo thỏa thuận riêng (Đã giải quyết), hoặc đóng ở trạng thái Bị bác nếu nằm ngoài phạm vi.",
                  )
                : t("Publish your decision and its reasoning. It cannot be changed afterwards.", "Công bố quyết định và lập luận. Không thể sửa về sau.")}
          </p>
        </div>
        {row.core.status === DisputeStatus.Open && (
          <Button variant="outline" className="w-full" disabled={tx.busy} onClick={async () => (await tx.send("setStatus", [row.id, DisputeStatus.UnderReview, `0x${"0".repeat(64)}`])) && onDone()}>
            <Eye /> {t("Start review", "Bắt đầu xem xét")}
          </Button>
        )}
        <EvidenceFields
          draft={draft}
          onChange={setDraft}
          events={ctx?.events}
          targetLabel={label}
          idPrefix="decide"
          textLabel={t("Decision & reasoning", "Quyết định & lập luận")}
          textPlaceholder={t("What you found, which rule applies, and the outcome.", "Bạn phát hiện gì, áp dụng quy tắc nào, và kết quả.")}
        />
        <FieldError>{error}</FieldError>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!!problem || uploading || tx.busy} onClick={() => close(DisputeStatus.Resolved)}>
            {(uploading || tx.busy) && <Loader2 className="animate-spin" />} {t("Resolve", "Giải quyết")}
          </Button>
          <Button variant="outline" disabled={!!problem || uploading || tx.busy} onClick={() => close(DisputeStatus.Rejected)}>
            {t("Reject", "Bác")}
          </Button>
        </div>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </CardContent>
    </Card>
  );
}

function BackLink() {
  const t = useT();
  return (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/disputes">
        <ArrowLeft /> {t("Dispute Center", "Trung tâm khiếu nại")}
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

