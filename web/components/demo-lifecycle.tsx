"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ChainReference } from "@/components/chain-reference";
import { useT } from "@/components/lang-provider";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVENANCE, STAGES, lifecycleSchema, type Lifecycle } from "@/lib/demo-lifecycle";
import { formatBudget, formatTokenAmount, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Five stages at this pace is about the 60 seconds the walkthrough is meant to take. */
const STAGE_MS = 12_000;

export function DemoLifecycle() {
  const t = useT();
  const demo = useQuery({
    queryKey: ["demo-lifecycle"],
    queryFn: async () => lifecycleSchema.parse(await (await fetch("/demo/lifecycle.json")).json()),
    staleTime: Infinity,
  });

  if (demo.error) return <p className="text-sm text-destructive">{t("Could not load the recorded lifecycle.", "Không tải được vòng đời đã ghi.")}</p>;
  if (!demo.data) return <p className="text-sm text-muted-foreground">{t("Loading…", "Đang tải…")}</p>;
  return <Walkthrough demo={demo.data} />;
}

function Walkthrough({ demo }: { demo: Lifecycle }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { story, report } = demo;
  const stage = STAGES[index];
  const provenance = PROVENANCE[demo.provenance];

  useEffect(() => {
    if (!playing) return;
    if (index === STAGES.length - 1) return setPlaying(false);
    const timer = setTimeout(() => setIndex((i) => i + 1), STAGE_MS);
    return () => clearTimeout(timer);
  }, [playing, index]);

  const name = (address: string) => story.bidders[address]?.name;
  const txs = report.references.filter((r) => stage.labels.includes(r.label));
  const showPrices = index >= 2;
  const showWinner = index >= 3;
  const allPassed = report.checks.filter((c) => c.required && c.status === "PASS").length;
  const required = report.checks.filter((c) => c.required).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("Plinths · lifecycle walkthrough", "Plinths · xem nhanh vòng đời")}
        title={t("One tender, start to finish", "Một gói thầu, từ đầu đến cuối")}
        description={t(provenance.detail)}
        actions={<Badge variant="warning">{t(provenance.badge)}</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>{story.buyer}</CardTitle>
          <CardDescription>{t(story.need[0], story.need[1])}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">{t("Illustrative scenario, not a customer. It decides on:", "Tình huống minh họa, không phải khách hàng thật. Tiêu chí đánh giá:")}</p>
          <ul className="flex flex-wrap gap-2">
            {story.criteria.map(([en, vi]) => (
              <li key={en}>
                <Badge variant="muted">{t(en, vi)}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <ol className="grid grid-cols-5 gap-1 sm:gap-2" aria-label={t("Lifecycle stages", "Các giai đoạn")}>
            {STAGES.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[0.7rem] sm:text-xs",
                    i === index ? "border-primary bg-accent font-semibold" : "border-border text-muted-foreground",
                  )}
                >
                  {i < index ? <CheckCircle2 className="size-4 text-success" /> : <CircleDashed className="size-4" />}
                  {t(s.title)}
                </button>
              </li>
            ))}
          </ol>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="min-h-16 text-base leading-relaxed">{t(stage.say)}</p>

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-y border-overlay/[0.07] bg-overlay/[0.025] text-left text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">{t("Bidder", "Nhà thầu")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("Price", "Giá")}</th>
                  <th className="px-5 py-2 font-medium">{t("What happened", "Diễn biến")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.revealSet.entries.map((e) => {
                  const won = showWinner && e.bidder.toLowerCase() === report.outcome.winner?.toLowerCase();
                  const note = story.bidders[e.bidder]?.note;
                  return (
                    <tr key={e.bidder} className={cn(won && "bg-accent/60")}>
                      <td className="px-5 py-3 font-medium">{name(e.bidder) ?? <ChainReference type="address" value={e.bidder} />}</td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums">{showPrices ? formatTokenAmount(BigInt(e.amount)) : t("Sealed", "Niêm phong")}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {won && <Badge variant="success" className="mr-2">{t("Winner", "Trúng thầu")}</Badge>}
                        {showWinner && note ? t(note[0], note[1]) : <code className="break-all">{shortHash(e.commitment)}</code>}
                      </td>
                    </tr>
                  );
                })}
                {report.revealSet.notRevealed.map((address) => {
                  const note = story.bidders[address]?.note;
                  return (
                    <tr key={address} className="text-muted-foreground">
                      <td className="px-5 py-3 font-medium">{name(address) ?? <ChainReference type="address" value={address} />}</td>
                      <td className="px-2 py-3 text-right">{t("Sealed", "Niêm phong")}</td>
                      <td className="px-5 py-3 text-xs">{index >= 2 && note ? t(note[0], note[1]) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium">{t("Transactions in this stage", "Giao dịch ở giai đoạn này")}</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {txs.map((tx) => (
                <li key={`${tx.txHash}-${tx.label}`} className="flex flex-wrap gap-x-3">
                  <span>{tx.label}</span>
                  <ChainReference type="tx" value={tx.txHash} />
                  <span>
                    {t("block", "block")} {tx.blockNumber}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label={t("Previous stage", "Giai đoạn trước")}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (index === STAGES.length - 1) setIndex(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? t("Pause", "Tạm dừng") : t("Play", "Phát")}
            </Button>
            <Button variant="outline" size="sm" disabled={index === STAGES.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label={t("Next stage", "Giai đoạn sau")}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {index === STAGES.length - 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t("Rechecked by the independent verifier", "Được công cụ độc lập kiểm tra lại")}
            </CardTitle>
            <CardDescription>
              {t(
                `Result ${report.result}: ${allPassed} of ${required} required checks passed, using only chain data and no Plinths server. Budget ${report.budget ? formatBudget(BigInt(report.budget.min), BigInt(report.budget.max)) : "n/a"}.`,
                `Kết quả ${report.result}: đạt ${allPassed}/${required} kiểm tra bắt buộc, chỉ dùng dữ liệu chain, không cần máy chủ Plinths. Ngân sách ${report.budget ? formatBudget(BigInt(report.budget.min), BigInt(report.budget.max)) : "không có"}.`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="break-all text-xs text-muted-foreground">
              {t("Reveal-set digest", "Digest tập công bố")}: <code>{report.revealSet.digest}</code>
            </p>
            <div>
              <p className="mb-1 font-medium">{t("What this does not prove (from the report, in English)", "Điều này không chứng minh được (trích báo cáo, bằng tiếng Anh)")}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {report.limitations.slice(0, 2).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
