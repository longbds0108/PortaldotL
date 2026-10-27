"use client";

import { AlertTriangle, Bot, CheckCircle2, CircleDashed, Clock, Cpu, Gavel, HelpCircle, Loader2, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { useLang, useT } from "@/components/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_LABEL, assistantReportSchema, type AssistantReport } from "@/lib/dispute-assistant";
import type { CheckStatus, EngineCheck } from "@/lib/dispute-engine";
import { TRACK_LABEL, TRACK_TEXT, type Track } from "@/lib/disputes";
import { shortAddress, shortHash } from "@/lib/format";
import { dateLocale, type Text } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TRACK_ICON: Record<Track, typeof Cpu> = { engine: Cpu, panel: Gavel, parties: Users };

export function TrackBadge({ track, className }: { track: Track; className?: string }) {
  const Icon = TRACK_ICON[track];
  const t = useT();
  return (
    <Badge variant={track === "engine" ? "success" : track === "panel" ? "secondary" : "outline"} className={className}>
      <Icon className="size-3" /> {t(TRACK_LABEL[track])}
    </Badge>
  );
}

/** "Who decides" card for one dispute. */
export function TrackCard({ track }: { track: Track }) {
  const Icon = TRACK_ICON[track];
  const t = useT();
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <p className="eyebrow">{t("Who decides", "Ai quyết định")}</p>
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Icon className="size-4 text-link" /> {t(TRACK_LABEL[track])}
        </p>
        <p className="text-[0.76rem] leading-relaxed text-muted-foreground">{t(TRACK_TEXT[track])}</p>
      </CardContent>
    </Card>
  );
}

const STATUS_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string; label: Text }> = {
  pass: { icon: CheckCircle2, cls: "text-success-fg", label: ["Passes", "Đạt"] },
  fail: { icon: XCircle, cls: "text-destructive", label: ["Problem found", "Có vấn đề"] },
  pending: { icon: Clock, cls: "text-warning-fg", label: ["Not finished", "Chưa xong"] },
  unknown: { icon: HelpCircle, cls: "text-muted-foreground", label: ["Times unavailable", "Không có thời gian"] },
};

/** Verification Engine results; `focus` = the check the dispute's reason asks about (shown first and open). */
export function EngineCard({ checks, focus, loading, title = "Verification Engine" }: { checks?: EngineCheck[]; focus?: EngineCheck["key"]; loading?: boolean; title?: string }) {
  const t = useT();
  const ordered = checks ? [...checks].sort((a, b) => (a.key === focus ? -1 : b.key === focus ? 1 : 0)) : [];
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Cpu className="size-3.5" /> {title}
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-muted-foreground">
            {t(
              "Computed in your browser from public chain data. Anyone who runs it gets the same result.",
              "Được tính ngay trong trình duyệt từ dữ liệu chain công khai. Ai chạy cũng ra cùng một kết quả.",
            )}
          </p>
        </div>
        {loading || !checks ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("Reading the contracts…", "Đang đọc contract…")}
          </p>
        ) : (
          <div className="space-y-3">
            {ordered.map((c) => (
              <CheckBlock key={c.key} check={c} open={c.key === focus || !focus} highlighted={c.key === focus} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CheckBlock({ check, open: initiallyOpen, highlighted }: { check: EngineCheck; open: boolean; highlighted: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const s = STATUS_ICON[check.status];
  const t = useT();
  return (
    <div className={cn("well rounded-[12px] p-3.5", highlighted && "border-[rgba(131,170,255,.35)]")}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[0.84rem] font-medium text-foreground">
            <s.icon className={cn("size-4 shrink-0", s.cls)} />
            {check.title}
            {highlighted && <Badge variant="secondary">{t("This dispute", "Khiếu nại này")}</Badge>}
          </span>
          <span className="mt-0.5 block text-[0.74rem] text-muted-foreground">{check.summary}</span>
        </span>
        <span className={cn("shrink-0 text-[0.7rem]", s.cls)}>{t(s.label)}</span>
      </button>
      {open && check.items.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-overlay/[0.06] pt-3">
          {check.items.map((i, n) => {
            const st = STATUS_ICON[i.status];
            return (
              <li key={n} className="flex items-start gap-2 text-[0.74rem]">
                <st.icon className={cn("mt-0.5 size-3.5 shrink-0", st.cls)} />
                <span className="min-w-0">
                  <span className="text-foreground-soft">{i.label}</span> <span className="text-muted-foreground">— {i.detail}</span>
                  {i.txHash && (
                    <span className="ml-1 font-mono text-link" title={i.txHash}>
                      {shortHash(i.txHash)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── Dispute Assistant (AI) ─────────────────────────

type Report = AssistantReport & { model?: string; generatedAt?: string };

/** AI briefing for the arbitration panel. It never decides; anyone can generate it from the public record. */
export function AssistantCard({ disputeId }: { disputeId: bigint }) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const t = useT();

  async function generate() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/agent/dispute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disputeId: disputeId.toString() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || t(`Request failed (${res.status})`, `Yêu cầu thất bại (${res.status})`));
      const parsed = assistantReportSchema.passthrough().parse(json) as Report;
      setReport(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not prepare the report.", "Không chuẩn bị được báo cáo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <Bot className="size-3.5" /> {t("Dispute Assistant", "Trợ lý khiếu nại")}
            </p>
            <h2 className="mt-2 text-[1.1rem] font-medium text-foreground">{t("Briefing for the panel", "Bản tóm tắt cho hội đồng")}</h2>
            <p className="mt-1 max-w-xl text-[0.76rem] leading-relaxed text-muted-foreground">
              {t(
                "The assistant summarises the evidence, lines up the timeline, and points out what is missing. It does not decide, score or recommend an outcome.",
                "Trợ lý tóm tắt bằng chứng, sắp xếp dòng thời gian và chỉ ra những gì còn thiếu. Trợ lý không quyết định, không chấm điểm và không đề xuất kết quả.",
              )}
            </p>
          </div>
          <Button variant="outline" disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="animate-spin" /> : <Bot />} {report ? t("Regenerate", "Tạo lại") : t("Prepare briefing", "Chuẩn bị bản tóm tắt")}
          </Button>
        </div>
        {error && (
          <p className="flex items-start gap-2 text-[0.78rem] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {report && <ReportView report={report} />}
      </CardContent>
    </Card>
  );
}

function ReportView({ report }: { report: Report }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-4 text-[0.8rem]">
      <p className="rounded-[10px] border border-[rgba(232,181,76,.28)] px-3 py-2 text-[0.72rem] text-warning-fg">
        {t(
          "AI-generated briefing — may be wrong or incomplete. Check every point against the evidence and the Verification Engine.",
          "Bản tóm tắt do AI tạo — có thể sai hoặc thiếu. Hãy đối chiếu từng điểm với bằng chứng và Verification Engine.",
        )}
      </p>
      <Section title={t("Summary", "Tóm tắt")}>
        <p className="whitespace-pre-wrap leading-relaxed text-foreground-soft">{report.summary}</p>
      </Section>
      {report.timeline.length > 0 && (
        <Section title={t("Timeline", "Dòng thời gian")}>
          <ol className="space-y-1.5">
            {report.timeline.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-[0.72rem] text-muted-foreground">{item.when}</span>
                <span className="text-foreground-soft">{item.event}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {report.evidence.length > 0 && (
        <Section title={t("Claims and their support", "Các nhận định và căn cứ")}>
          <ul className="space-y-2">
            {report.evidence.map((e, i) => (
              <li key={i} className="well rounded-[10px] p-2.5">
                <p className="text-foreground-soft">{e.point}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.72rem]">
                  <Badge variant={e.support === "on-chain" ? "success" : e.support === "document" ? "outline" : "warning"}>{t(SUPPORT_LABEL[e.support])}</Badge>
                  {e.note && <span className="text-muted-foreground">{e.note}</span>}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {report.gaps.length > 0 && (
        <Section title={t("Missing or inconsistent", "Thiếu hoặc mâu thuẫn")}>
          <ul className="list-disc space-y-1 pl-5 text-foreground-soft">
            {report.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Section>
      )}
      {report.questions.length > 0 && (
        <Section title={t("Questions the panel may ask", "Câu hỏi hội đồng có thể đặt ra")}>
          <ul className="list-disc space-y-1 pl-5 text-foreground-soft">
            {report.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}
      {report.injectionWarnings.length > 0 && (
        <Section title={t("Instruction-like text found in the evidence", "Đoạn văn giống câu lệnh trong bằng chứng")}>
          <ul className="space-y-1.5">
            {report.injectionWarnings.map((w, i) => (
              <li key={i} className="text-[0.74rem] text-warning-fg">
                {shortAddress(w.author)}: “{w.quote}”
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
        <CircleDashed className="size-3" /> {report.model ?? "AI"} · {report.generatedAt ? new Date(report.generatedAt).toLocaleString(dateLocale(lang)) : ""} ·{" "}
        {t("not stored", "không lưu lại")}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

