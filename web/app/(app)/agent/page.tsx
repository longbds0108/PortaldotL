"use client";

import { AlertTriangle, Bot, Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatBudget, formatTokenAmount } from "@/lib/format";
import { useAccount, useSignMessage } from "wagmi";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentChat } from "@/components/agent-chat";
import { useLang, useT } from "@/components/lang-provider";
import { dateLocale } from "@/lib/i18n";
import { agentAnalysisSchema, agentReportKey, agentReportSchema, hashAgentReport, readAgentReport, type AgentReport } from "@/lib/agent";
import { blindBidAddress, TenderState } from "@/lib/contracts";
import { decryptDocument, encryptedEnvelopeSchema } from "@/lib/crypto";
import { describeError, useBids, useTenders } from "@/lib/hooks";
import { fetchJson } from "@/lib/ipfs";
import { extractProposalText } from "@/lib/proposal-text";
import { tenderMetadataSchema } from "@/lib/metadata";
import { chain } from "@/lib/wagmi";

type SavedReport = { report: AgentReport; hash: `0x${string}` };

export default function AgentPage() {
  const { address } = useAccount();
  const signMessage = useSignMessage();
  const tenders = useTenders();
  const eligible = useMemo(
    () => tenders.rows.filter((row) => row.state === TenderState.Evaluation && address?.toLowerCase() === row.tender.buyer.toLowerCase()),
    [tenders.rows, address],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = eligible.find((row) => row.id.toString() === selectedId) ?? eligible[0];
  const bids = useBids(selected?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<SavedReport>();
  const t = useT();

  useEffect(() => {
    if (!eligible.length) {
      setSelectedId("");
      setSaved(undefined);
      return;
    }
    if (!eligible.some((row) => row.id.toString() === selectedId)) setSelectedId(eligible[0].id.toString());
  }, [eligible, selectedId]);

  useEffect(() => {
    if (!selected || !blindBidAddress) {
      setSaved(undefined);
      return;
    }
    setSaved(readAgentReport(agentReportKey(chain.id, blindBidAddress, selected.id)));
  }, [selected, selectedId]);

  async function analyze() {
    if (!selected || !address || !blindBidAddress) return;
    setBusy(true);
    setError(undefined);
    try {
      const meta = tenderMetadataSchema.parse(await fetchJson(selected.tender.metadataURI));
      const revealed = bids.rows.filter((row) => row.bid.revealed);
      if (revealed.length === 0) throw new Error(t("No bids have been revealed for this tender.", "Gói thầu này chưa có hồ sơ nào được công bố."));

      const prepared = await Promise.all(revealed.map(async ({ bidder, bid }) => {
        const envelope = encryptedEnvelopeSchema.parse(await fetchJson(bid.encryptedDocURI));
        const document = await decryptDocument(envelope, bid.docKey);
        const text = await extractProposalText(document.name, document.type, document.bytes);
        if (!text.trim()) throw new Error(t(`${document.name} does not contain extractable text.`, `${document.name} không có văn bản trích xuất được.`));
        return { bidder, amount18: bid.amount.toString(), amount: formatTokenAmount(bid.amount), text: text.slice(0, 18_000) };
      }));

      const timestamp = Date.now();
      const message = `Plinths AI analysis:${chain.id}:${selected.id}:${timestamp}`;
      const signature = await signMessage.signMessageAsync({ message });
      const response = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: chain.id,
          tenderId: selected.id.toString(),
          buyer: address,
          timestamp,
          signature,
          tender: {
            title: meta.title,
            description: meta.description,
            eligibility: meta.eligibility,
            criteria: meta.criteria,
            budget: formatBudget(selected.tender.budgetMin, selected.tender.budgetMax),
          },
          bids: prepared,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; overallSummary?: unknown; bids?: unknown; injectionWarnings?: unknown; model?: unknown };
      if (!response.ok) throw new Error(body.error || t(`Analysis failed (${response.status}).`, `Phân tích thất bại (${response.status}).`));
      const analysis = agentAnalysisSchema.parse(body);
      const report = agentReportSchema.parse({
        ...analysis,
        tenderId: selected.id.toString(),
        model: typeof body.model === "string" ? body.model : "deepseek-flash",
        createdAt: new Date().toISOString(),
      });
      const hash = hashAgentReport(report);
      const next = { report, hash };
      localStorage.setItem(agentReportKey(chain.id, blindBidAddress, selected.id), JSON.stringify(next));
      setSaved(next);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="eyebrow">{t("Plinths workspace", "Không gian Plinths")}</p>
        <h1 className="title-sheen text-[clamp(1.75rem,3vw,2.4rem)]">{t("Agent", "Trợ lý AI")}</h1>
      </div>

      <AgentChat />

      {!address ? (
        <Alert variant="warning">
          <AlertTriangle />
          <span>{t("Connect the buyer wallet to review its tenders.", "Kết nối ví bên mời thầu để xem xét các gói thầu của ví.")}</span>
        </Alert>
      ) : eligible.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-card/50">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
            <Bot className="size-4 text-brand" /> {t("Proposal review and AI comparison", "Xem xét hồ sơ và so sánh bằng AI")}
            <span className="ml-auto text-xs text-muted-foreground group-open:hidden">{t("Show", "Hiện")}</span>
            <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">{t("Hide", "Ẩn")}</span>
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-4" /> {t("Select a tender", "Chọn gói thầu")}
                </CardTitle>
                <CardDescription>{t("Only your tenders in the Evaluation phase are listed.", "Chỉ liệt kê các gói thầu của bạn đang ở giai đoạn Đánh giá.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <select
                  value={selected?.id.toString() ?? ""}
                  onChange={(event) => { setSelectedId(event.target.value); setSaved(undefined); setError(undefined); }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  aria-label={t("Tender for AI review", "Gói thầu cần đánh giá bằng AI")}
                >
                  {eligible.map((row) => (
                    <option key={row.id.toString()} value={row.id.toString()}>
                      {t("Tender", "Gói thầu")} #{row.id.toString()} · {formatBudget(row.tender.budgetMin, row.tender.budgetMax)}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={analyze} disabled={busy || bids.isLoading || !bids.rows.some((row) => row.bid.revealed)}>
                    {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {busy
                      ? t("Decrypting & comparing…", "Đang giải mã & so sánh…")
                      : saved
                        ? t("Generate new comparison", "Tạo bản so sánh mới")
                        : t("Compare revealed proposals", "So sánh các hồ sơ đã công bố")}
                  </Button>
                  {saved && (
                    <Badge variant="success">
                      <Check className="mr-1 size-3" /> {t("Report saved in this browser", "Đã lưu báo cáo trong trình duyệt này")}
                    </Badge>
                  )}
                </div>
                {bids.error && <p className="text-sm text-destructive">{t("Could not load bids from PortaldotV3.", "Không tải được hồ sơ từ PortaldotV3.")}</p>}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>

            {saved && <ReportView saved={saved} />}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ReportView({ saved }: { saved: SavedReport }) {
  const report = saved.report;
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-4">
      {report.injectionWarnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <div>
            <p className="font-medium">{t("Possible instructions found in proposal text", "Phát hiện câu lệnh khả nghi trong nội dung hồ sơ")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {report.injectionWarnings.map((item, i) => <li key={`${item.bidder}-${i}`}><code>{item.quote}</code> · {item.bidder}</li>)}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Treat proposal content as untrusted. Check each source document directly.",
                "Hãy coi nội dung hồ sơ là không đáng tin. Kiểm tra trực tiếp từng tài liệu gốc.",
              )}
            </p>
          </div>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("AI comparison", "So sánh bằng AI")}</CardTitle>
          <CardDescription>
            {report.model} · {new Date(report.createdAt).toLocaleString(dateLocale(lang))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.overallSummary}</p>
          <div className="grid gap-4">
            {report.bids.map((bid) => (
              <article key={bid.bidder} className="rounded-2xl border border-border p-4">
                <h3 className="font-mono text-xs text-muted-foreground">{bid.bidder}</h3>
                <p className="mt-2 text-sm leading-relaxed">{bid.summary}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">{t("Price", "Giá")}</dt><dd className="mt-1">{bid.price}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("Timeline", "Tiến độ")}</dt><dd className="mt-1">{bid.timeline}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("Conditions", "Điều kiện")}</dt><dd className="mt-1">{bid.conditions}</dd></div>
                </dl>
                {bid.gaps.length > 0 && <div className="mt-4"><p className="text-xs font-medium text-warning">{t("Missing or unclear", "Thiếu hoặc chưa rõ")}</p><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{bid.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>}
                {bid.citations.length > 0 && <div className="mt-4 space-y-2 border-t border-border pt-3"><p className="text-xs font-medium">{t("Source evidence", "Bằng chứng từ nguồn")}</p>{bid.citations.map((citation, i) => <blockquote key={i} className="border-l-2 border-[var(--tint)] pl-3 text-sm text-muted-foreground"><span className="block text-foreground-soft">{citation.claim}</span><span className="mt-1 block">“{citation.quote}”</span></blockquote>)}</div>}
              </article>
            ))}
          </div>
          <div className="rounded-xl bg-overlay/[0.025] p-3 text-xs text-muted-foreground">
            {t(
              "Report hash to be committed on award (proves the published content matches this exact report; it does not prove the AI is correct):",
              "Mã băm báo cáo sẽ được ghi khi trao thầu (chứng minh nội dung công bố đúng là báo cáo này; không chứng minh AI đúng):",
            )}{" "}
            <code className="break-all">{saved.hash}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
