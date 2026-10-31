"use client";

import { AlertTriangle, Download, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";
import { ChainReference } from "@/components/chain-reference";
import { WalletGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { blindBidAddress, TenderState, pricesVisible, withinBudget } from "@/lib/contracts";
import { uriToDigest } from "@/lib/cid";
import { decryptDocument, encryptedEnvelopeSchema } from "@/lib/crypto";
import { agentReportKey, readAgentReport, type AgentReport } from "@/lib/agent";
import { formatBudget, formatTokenAmount } from "@/lib/format";
import { describeError, useBids, useBlindBidTx, type BidRow, type TenderRow } from "@/lib/hooks";
import { fetchJson, uploadJson } from "@/lib/ipfs";
import type { AwardReason, TenderMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

export default function EvaluatePage() {
  const t = useT();
  return (
    <TenderShell>
      {({ row, meta }) => (
        <>
          <PageHeader
            eyebrow={t("Buyer · evaluation", "Bên mời thầu · đánh giá")}
            title={t("Evaluation", "Đánh giá")}
            description={
              meta?.title ? `${meta.title} · ${t("budget", "ngân sách")} ${formatBudget(row.tender.budgetMin, row.tender.budgetMax)}` : undefined
            }
          />
          <WalletGate message={t("Connect the buyer wallet to evaluate.", "Kết nối ví bên mời thầu để đánh giá.")}>
            <EvaluateGuard row={row} meta={meta} />
          </WalletGate>
        </>
      )}
    </TenderShell>
  );
}

function EvaluateGuard({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { address } = useAccount();
  const t = useT();
  if (blindBidAddress && address?.toLowerCase() !== row.tender.buyer.toLowerCase()) {
    return <Notice>{t("Only the buyer of this tender can evaluate bids.", "Chỉ bên mời thầu của gói thầu này mới được đánh giá hồ sơ.")}</Notice>;
  }
  if (row.state !== TenderState.Evaluation) {
    return (
      <Notice>
        {t(
          "Evaluation is available only after the reveal deadline and before an award. Current phase does not allow it.",
          "Chỉ đánh giá được sau hạn công bố và trước khi trao thầu. Giai đoạn hiện tại chưa cho phép.",
        )}{" "}
        <Link className="underline" href={`/tenders/${row.id}`}>
          {t("Back to tender", "Quay lại gói thầu")}
        </Link>
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
  const [aiReport, setAiReport] = useState<{ report: AgentReport; hash: Hex }>();
  const t = useT();

  useEffect(() => {
    if (!blindBidAddress) return setAiReport(undefined);
    setAiReport(readAgentReport(agentReportKey(chain.id, blindBidAddress, id)));
  }, [id]);

  // Guard again at render time: amounts only in Evaluation/Awarded.
  const show = pricesVisible(state);
  const revealed = bids.rows.filter((b) => b.bid.revealed).sort((a, b) => (a.bid.amount < b.bid.amount ? -1 : 1));
  const unrevealed = bids.rows.filter((b) => !b.bid.revealed);
  const lowest = revealed[0]?.bid.amount;

  async function award() {
    setError(undefined);
    if (!winner) return setError(t("Select a winning bid.", "Hãy chọn hồ sơ trúng thầu."));
    const chosen = revealed.find((b) => b.bidder === winner);
    if (!chosen || !withinBudget(chosen.bid.amount, tender))
      return setError(t("This bid is outside the published budget, so it cannot win.", "Hồ sơ này nằm ngoài ngân sách đã công bố nên không thể trúng thầu."));
    if (reason.trim().length < 10)
      return setError(t("Explain the decision (at least 10 characters). It will be public.", "Hãy giải thích quyết định (ít nhất 10 ký tự). Nội dung sẽ được công khai."));
    setUploading(true);
    let reasonDigest: Hex;
    try {
      // The optional AI report is linked (with its hash) from the reason document, whose digest goes on-chain,
      // so the report stays verifiable without storing anything else in the contract.
      const doc: AwardReason = {
        version: 1,
        tenderId: id.toString(),
        winner,
        reason: reason.trim(),
        decidedAt: new Date().toISOString(),
        ...(aiReport
          ? { aiSummaryURI: await uploadJson(aiReport.report, "plinths-ai-assessment.json"), aiSummaryHash: aiReport.hash }
          : {}),
      };
      reasonDigest = uriToDigest(await uploadJson(doc, "award-reason.json"));
    } catch (e) {
      setError(describeError(e));
      return;
    } finally {
      setUploading(false);
    }
    if (await tx.send("award", [id, winner, reasonDigest])) router.push(`/tenders/${id}/results`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("Revealed bids", "Hồ sơ đã công bố")} ({revealed.length})
          </CardTitle>
          <CardDescription>
            {t(
              "Sorted by price. Documents are decrypted in your browser with the key each bidder published at reveal.",
              "Sắp xếp theo giá. Hồ sơ được giải mã trong trình duyệt bằng khóa mỗi nhà thầu công bố khi reveal.",
            )}
            {meta?.criteria ? ` ${t("Criteria:", "Tiêu chí:")} ${meta.criteria}` : ""}{" "}
            <Link className="underline" href="/agent">
              {t("Open Plinths Agent to compare proposals.", "Mở Trợ lý Plinths để so sánh hồ sơ.")}
            </Link>
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
                    <th className="px-5 py-2 font-medium">{t("Select", "Chọn")}</th>
                    <th className="px-2 py-2 font-medium">{t("Bidder", "Nhà thầu")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("Amount", "Giá")}</th>
                    <th className="px-2 py-2 font-medium">{t("Budget fit", "So với ngân sách")}</th>
                    <th className="px-5 py-2 font-medium">{t("Proposal", "Hồ sơ")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {revealed.map((b) => (
                    <tr key={b.bidder} className={cn(winner === b.bidder && "bg-accent/60")}>
                      <td className="px-5 py-3">
                        <input
                          type="radio"
                          name="winner"
                          aria-label={t(`Select ${b.bidder}`, `Chọn ${b.bidder}`)}
                          checked={winner === b.bidder}
                          disabled={!withinBudget(b.bid.amount, tender)}
                          onChange={() => setWinner(b.bidder)}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <ChainReference type="address" value={b.bidder} />
                      </td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums">
                        {show ? formatTokenAmount(b.bid.amount) : "—"}
                        {b.bid.amount === lowest && (
                          <Badge variant="success" className="ml-2">
                            {t("Lowest", "Thấp nhất")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {b.bid.amount < tender.budgetMin ? (
                          <Badge variant="warning">{t("Below range", "Dưới khoảng")}</Badge>
                        ) : b.bid.amount > tender.budgetMax ? (
                          <Badge variant="destructive">{t("Over budget", "Vượt ngân sách")}</Badge>
                        ) : (
                          <Badge variant="muted">{t("Within budget", "Trong ngân sách")}</Badge>
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
                        <Badge variant="destructive">{t("Not revealed — excluded", "Không công bố — bị loại")}</Badge>
                      </td>
                      <td className="px-5 py-3 text-xs">{t("Document key never published", "Chưa từng công bố khóa hồ sơ")}</td>
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
            <Trophy className="size-4" /> {t("Award", "Trao thầu")}
          </CardTitle>
          <CardDescription>
            {t(
              "You choose the winner. Your justification and any AI comparison are published with the result.",
              "Bạn chọn nhà thầu trúng thầu. Lý do của bạn và bản so sánh AI (nếu có) được công bố cùng kết quả.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">{t("Reason for decision", "Lý do quyết định")}</Label>
            <Textarea
              id="reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                "Lowest price among bids meeting the eligibility requirements; strongest technical approach…",
                "Giá thấp nhất trong các hồ sơ đủ điều kiện; giải pháp kỹ thuật tốt nhất…",
              )}
            />
          </div>
          {aiReport && (
            <Alert>
              <Trophy />
              <span>
                {t(
                  "AI comparison from Plinths Agent will be published on IPFS and its hash stored on-chain with this award.",
                  "Bản so sánh AI của Trợ lý Plinths sẽ được đăng lên IPFS và mã băm của nó được lưu on-chain cùng quyết định trao thầu.",
                )}
              </span>
            </Alert>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" disabled={!blindBidAddress || !winner || uploading || tx.busy} onClick={award}>
            {(uploading || tx.busy) && <Loader2 className="animate-spin" />}
            {t("Award tender", "Trao thầu")}
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
  const t = useT();
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
      setErr(e instanceof Error ? e.message : t("Could not decrypt", "Không giải mã được"));
      setState("error");
    }
  }
  return (
    <div>
      <Button size="sm" variant="outline" onClick={run} disabled={state === "busy"}>
        {state === "busy" ? <Loader2 className="animate-spin" /> : <Download />} {t("Decrypt", "Giải mã")}
      </Button>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </div>
  );
}
