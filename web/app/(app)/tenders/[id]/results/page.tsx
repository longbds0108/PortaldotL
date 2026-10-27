"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, ShieldCheck, Sparkles, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Hex } from "viem";
import { ChainReference } from "@/components/chain-reference";
import { useLang, useT } from "@/components/lang-provider";
import { OnchainTimeline } from "@/components/onchain-timeline";
import { PageHeader } from "@/components/page-header";
import { StateBadge } from "@/components/state-badge";
import { TenderShell } from "@/components/tender-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeCommitment } from "@/lib/commitment";
import { agentReportSchema, hashAgentReport } from "@/lib/agent";
import { TenderState, pricesVisible, type Bid, type Tender } from "@/lib/contracts";
import { formatBudget, formatDateTime, formatTokenAmount, shortHash } from "@/lib/format";
import { useBids, type BidRow, type TenderRow } from "@/lib/hooks";
import type { T } from "@/lib/i18n";
import { fetchJson } from "@/lib/ipfs";
import { awardReasonSchema, type TenderMetadata } from "@/lib/metadata";

export default function ResultsPage() {
  return <TenderShell>{(ctx) => <Results {...ctx} />}</TenderShell>;
}

type Verdict = { ok: boolean; checks: { label: string; ok: boolean }[] };

/** Recomputes the commitment in the browser from the revealed (public) opening. */
function verifyBid(tenderId: bigint, tender: Tender, row: BidRow, t: T): Verdict {
  const { bid, bidder } = row;
  const recomputed = computeCommitment({
    tenderId,
    bidder,
    amount18: bid.amount,
    salt: bid.salt as Hex,
    docKey: bid.docKey as Hex,
  });
  const checks = [
    {
      label: t(
        "Revealed amount, salt and document key hash to the sealed commitment",
        "Giá, salt và khóa hồ sơ đã công bố băm ra đúng commitment niêm phong",
      ),
      ok: recomputed.toLowerCase() === bid.commitment.toLowerCase(),
    },
    // The contract only accepts commitments while the tender is Open; the block time, when the RPC still serves that
    // block, is shown as an extra check.
    {
      label: t(
        "Commitment was set before the submission deadline (the contract only accepts bids while Open)",
        "Commitment được ghi trước hạn nộp hồ sơ (contract chỉ nhận hồ sơ khi đang mở)",
      ),
      ok: bid.committedBlock > 0n && (bid.committedAt === 0n || bid.committedAt < tender.submissionDeadline),
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function Results({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { id, tender, state } = row;
  const bids = useBids(id);
  const show = pricesVisible(state);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const t = useT();
  const lang = useLang();

  const reason = useQuery({
    queryKey: ["award-reason", tender.reasonURI],
    queryFn: async () => awardReasonSchema.parse(await fetchJson(tender.reasonURI)),
    enabled: !!tender.reasonURI,
    staleTime: Infinity,
  });
  // The AI report (if any) is linked, with its hash, from the reason document whose digest is on-chain.
  const aiURI = reason.data?.aiSummaryURI;
  const aiHash = reason.data?.aiSummaryHash;
  const aiReview = useQuery({
    queryKey: ["agent-report", aiURI, aiHash],
    queryFn: async () => {
      const report = agentReportSchema.parse(await fetchJson(aiURI!));
      return { report, verified: hashAgentReport(report).toLowerCase() === aiHash!.toLowerCase() };
    },
    enabled: !!aiURI && !!aiHash,
    staleTime: Infinity,
  });

  const winnerBid = bids.rows.find((b) => b.bidder.toLowerCase() === tender.winner.toLowerCase())?.bid;
  const revealedRows = bids.rows.filter((b) => b.bid.revealed);
  const verifyAll = () =>
    setVerdicts(Object.fromEntries(revealedRows.map((b) => [b.bidder, verifyBid(id, tender, b, t)])));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(`Results · tender #${id}`, `Kết quả · gói thầu #${id}`)}
        title={meta?.title ?? t(`Tender #${id}`, `Gói thầu #${id}`)}
        description={t(
          `Results and proof of process · budget ${formatBudget(tender.budgetMin, tender.budgetMax)}`,
          `Kết quả và bằng chứng quy trình · ngân sách ${formatBudget(tender.budgetMin, tender.budgetMax)}`,
        )}
        actions={
          <Button asChild variant="outline">
            <Link href={`/tenders/${id}`}>{t("Tender details", "Chi tiết gói thầu")}</Link>
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
                <p className="font-semibold">{state === TenderState.Awarded ? t("Awarded", "Đã trao thầu") : t("Outcome", "Kết cục")}</p>
                <StateBadge state={state} />
              </div>
              {state === TenderState.Awarded ? (
                <p className="text-sm text-muted-foreground">
                  {t("Winner", "Nhà thầu trúng thầu")} <ChainReference type="address" value={tender.winner} />
                  {winnerBid && show && <> · <span className="font-semibold text-foreground">{formatTokenAmount(winnerBid.amount)}</span></>}
                </p>
              ) : state === TenderState.Failed ? (
                <p className="text-sm text-muted-foreground">
                  {t("No bid was revealed in time — the tender failed.", "Không hồ sơ nào được công bố đúng hạn — gói thầu thất bại.")}
                </p>
              ) : state === TenderState.Evaluation ? (
                <p className="text-sm text-muted-foreground">{t("The buyer is evaluating revealed bids.", "Bên mời thầu đang đánh giá các hồ sơ đã công bố.")}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("Results are published after the reveal window.", "Kết quả được công bố sau cửa sổ công bố.")}</p>
              )}
            </div>
          </div>
          {tender.awardedBlock > 0n && (
            <p className="text-xs text-muted-foreground">
              {t("Decided in block", "Quyết định tại block")} {tender.awardedBlock.toString()}
            </p>
          )}
        </CardContent>
        {tender.reasonURI && (
          <CardContent className="border-t pt-4 text-sm">
            <p className="mb-1 font-medium">{t("Buyer's justification", "Lý do của bên mời thầu")}</p>
            {reason.data ? (
              <p className="whitespace-pre-wrap text-muted-foreground">{reason.data.reason}</p>
            ) : reason.error ? (
              <p className="text-destructive">{t("Could not load justification.", "Không tải được lý do.")}</p>
            ) : (
              <p className="text-muted-foreground">{t("Loading…", "Đang tải…")}</p>
            )}
          </CardContent>
        )}
      </Card>

      {aiURI && aiHash && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> {t("AI proposal comparison", "So sánh hồ sơ bằng AI")}
            </CardTitle>
            <CardDescription>
              {t(
                "AI-assisted evidence only. The buyer selected the winner. Report hash (in the on-chain award reason):",
                "Chỉ là bằng chứng hỗ trợ từ AI. Bên mời thầu tự chọn nhà thầu trúng thầu. Mã băm báo cáo (trong lý do trao thầu on-chain):",
              )}{" "}
              <code className="break-all">{shortHash(aiHash)}</code>
              {aiReview.data && (
                <span className={aiReview.data.verified ? "ml-2 text-success" : "ml-2 text-destructive"}>
                  {aiReview.data.verified ? t("· Hash verified", "· Mã băm khớp") : t("· Hash mismatch", "· Mã băm không khớp")}
                </span>
              )}
              <span className="block">
                {t("The hash verifies report integrity, not the AI's accuracy.", "Mã băm xác minh báo cáo không bị sửa, không xác minh độ chính xác của AI.")}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {aiReview.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("Loading public comparison…", "Đang tải bản so sánh công khai…")}</p>
            ) : aiReview.error ? (
              <p className="text-sm text-destructive">{t("Could not load or verify the AI report.", "Không tải hoặc xác minh được báo cáo AI.")}</p>
            ) : aiReview.data && (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiReview.data.report.overallSummary}</p>
                {aiReview.data.report.injectionWarnings.length > 0 && (
                  <div className="rounded-xl border border-warning/30 bg-warning/[0.04] p-3 text-sm">
                    <p className="font-medium text-warning">{t("Possible prompt-injection text detected in a proposal", "Phát hiện đoạn văn có thể là prompt injection trong một hồ sơ")}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                      {aiReview.data.report.injectionWarnings.map((warning, i) => <li key={i}><code>{warning.quote}</code> · {warning.bidder}</li>)}
                    </ul>
                  </div>
                )}
                <div className="grid gap-4">
                  {aiReview.data.report.bids.map((bid) => (
                    <article key={bid.bidder} className="rounded-2xl border border-border p-4">
                      <p className="font-mono text-xs text-muted-foreground">{bid.bidder}</p>
                      <p className="mt-2 text-sm">{bid.summary}</p>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div><dt className="text-xs text-muted-foreground">{t("Price", "Giá")}</dt><dd className="mt-1">{bid.price}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{t("Timeline", "Tiến độ")}</dt><dd className="mt-1">{bid.timeline}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{t("Conditions", "Điều kiện")}</dt><dd className="mt-1">{bid.conditions}</dd></div>
                      </dl>
                      {bid.gaps.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">{bid.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
                      {bid.citations.length > 0 && <div className="mt-4 space-y-2 border-t border-border pt-3">{bid.citations.map((citation, i) => <blockquote key={i} className="border-l-2 border-[var(--tint)] pl-3 text-sm text-muted-foreground"><span className="block text-foreground-soft">{citation.claim}</span><span className="mt-1 block">“{citation.quote}”</span></blockquote>)}</div>}
                    </article>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t("Proof of process", "Bằng chứng quy trình")}
            </CardTitle>
            <CardDescription>
              {t(
                "Each bid's commitment was fixed on-chain before the deadline. Verify recomputes the hash in your browser from the revealed values — no trust in this website or the buyer needed.",
                "Commitment của mỗi hồ sơ đã được ghi on-chain trước hạn. Nút Kiểm chứng tính lại mã băm ngay trong trình duyệt từ các giá trị đã công bố — không cần tin website này hay bên mời thầu.",
              )}
            </CardDescription>
          </div>
          {revealedRows.length > 0 && show && (
            <Button variant="outline" onClick={verifyAll}>
              {t("Verify all", "Kiểm chứng tất cả")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-y border-overlay/[0.07] bg-overlay/[0.025] text-left text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">{t("Bidder", "Nhà thầu")}</th>
                  <th className="px-2 py-2 font-medium">Commitment</th>
                  <th className="px-2 py-2 font-medium">{t("Sealed at", "Niêm phong lúc")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("Amount", "Giá")}</th>
                  <th className="px-5 py-2 font-medium">{t("Verification", "Kiểm chứng")}</th>
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
                    onVerify={() => setVerdicts((v) => ({ ...v, [b.bidder]: verifyBid(id, tender, b, t) }))}
                  />
                ))}
                {bids.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                      {t("No bids were submitted.", "Không có hồ sơ nào được gửi.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("On-chain timeline", "Dòng thời gian on-chain")}</CardTitle>
          <CardDescription>
            {t("Submission deadline", "Hạn nộp hồ sơ")} {formatDateTime(tender.submissionDeadline, lang)} · {t("reveal deadline", "hạn công bố")}{" "}
            {formatDateTime(tender.revealDeadline, lang)}
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
  const t = useT();
  const lang = useLang();
  return (
    <tr className="align-top">
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChainReference type="address" value={row.bidder} />
          {isWinner && <Badge>{t("Winner", "Trúng thầu")}</Badge>}
        </div>
      </td>
      <td className="px-2 py-3 font-mono text-xs" title={bid.commitment}>
        {shortHash(bid.commitment)}
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground">
        {bid.committedAt > 0n ? formatDateTime(bid.committedAt, lang) : `block ${bid.committedBlock.toString()}`}
      </td>
      <td className="px-2 py-3 text-right tabular-nums">
        {!bid.revealed ? (
          <Badge variant="muted">
            <Lock className="size-3" /> {t("Not revealed", "Chưa công bố")}
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
            {t("Verify", "Kiểm chứng")}
          </Button>
        )}
      </td>
    </tr>
  );
}
