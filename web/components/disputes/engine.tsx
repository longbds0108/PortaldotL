"use client";

import { AlertTriangle, Bot, CheckCircle2, CircleDashed, Clock, Cpu, Gavel, HelpCircle, Loader2, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_LABEL, assistantReportSchema, type AssistantReport } from "@/lib/dispute-assistant";
import type { CheckStatus, EngineCheck } from "@/lib/dispute-engine";
import { TRACK_LABEL, TRACK_TEXT, type Track } from "@/lib/disputes";
import { shortAddress, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

const TRACK_ICON: Record<Track, typeof Cpu> = { engine: Cpu, panel: Gavel, parties: Users };

export function TrackBadge({ track, className }: { track: Track; className?: string }) {
  const Icon = TRACK_ICON[track];
  return (
    <Badge variant={track === "engine" ? "success" : track === "panel" ? "secondary" : "outline"} className={className}>
      <Icon className="size-3" /> {TRACK_LABEL[track]}
    </Badge>
  );
}

/** "Who decides" card for one dispute. */
export function TrackCard({ track }: { track: Track }) {
  const Icon = TRACK_ICON[track];
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <p className="eyebrow">Who decides</p>
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Icon className="size-4 text-link" /> {TRACK_LABEL[track]}
        </p>
        <p className="text-[0.76rem] leading-relaxed text-muted-foreground">{TRACK_TEXT[track]}</p>
      </CardContent>
    </Card>
  );
}

const STATUS_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  pass: { icon: CheckCircle2, cls: "text-success-fg", label: "Passes" },
  fail: { icon: XCircle, cls: "text-destructive", label: "Problem found" },
  pending: { icon: Clock, cls: "text-warning-fg", label: "Not finished" },
  unknown: { icon: HelpCircle, cls: "text-muted-foreground", label: "Times unavailable" },
};

/** Verification Engine results; `focus` = the check the dispute's reason asks about (shown first and open). */
export function EngineCard({ checks, focus, loading, title = "Verification Engine" }: { checks?: EngineCheck[]; focus?: EngineCheck["key"]; loading?: boolean; title?: string }) {
  const ordered = checks ? [...checks].sort((a, b) => (a.key === focus ? -1 : b.key === focus ? 1 : 0)) : [];
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Cpu className="size-3.5" /> {title}
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-muted-foreground">
            Computed in your browser from public chain data. Anyone who runs it gets the same result.
          </p>
        </div>
        {loading || !checks ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading the contracts…
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
  return (
    <div className={cn("well rounded-[12px] p-3.5", highlighted && "border-[rgba(131,170,255,.35)]")}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[0.84rem] font-medium text-foreground">
            <s.icon className={cn("size-4 shrink-0", s.cls)} />
            {check.title}
            {highlighted && <Badge variant="secondary">This dispute</Badge>}
          </span>
          <span className="mt-0.5 block text-[0.74rem] text-muted-foreground">{check.summary}</span>
        </span>
        <span className={cn("shrink-0 text-[0.7rem]", s.cls)}>{s.label}</span>
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
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      const parsed = assistantReportSchema.passthrough().parse(json) as Report;
      setReport(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the report.");
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
              <Bot className="size-3.5" /> Dispute Assistant
            </p>
            <h2 className="mt-2 text-[1.1rem] font-medium text-foreground">Briefing for the panel</h2>
            <p className="mt-1 max-w-xl text-[0.76rem] leading-relaxed text-muted-foreground">
              The assistant summarises the evidence, lines up the timeline, and points out what is missing. It does not decide,
              score or recommend an outcome.
            </p>
          </div>
          <Button variant="outline" disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="animate-spin" /> : <Bot />} {report ? "Regenerate" : "Prepare briefing"}
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
  return (
    <div className="space-y-4 text-[0.8rem]">
      <p className="rounded-[10px] border border-[rgba(232,181,76,.28)] px-3 py-2 text-[0.72rem] text-warning-fg">
        AI-generated briefing — may be wrong or incomplete. Check every point against the evidence and the Verification Engine.
      </p>
      <Section title="Summary">
        <p className="whitespace-pre-wrap leading-relaxed text-foreground-soft">{report.summary}</p>
      </Section>
      {report.timeline.length > 0 && (
        <Section title="Timeline">
          <ol className="space-y-1.5">
            {report.timeline.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-[0.72rem] text-muted-foreground">{t.when}</span>
                <span className="text-foreground-soft">{t.event}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {report.evidence.length > 0 && (
        <Section title="Claims and their support">
          <ul className="space-y-2">
            {report.evidence.map((e, i) => (
              <li key={i} className="well rounded-[10px] p-2.5">
                <p className="text-foreground-soft">{e.point}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.72rem]">
                  <Badge variant={e.support === "on-chain" ? "success" : e.support === "document" ? "outline" : "warning"}>{SUPPORT_LABEL[e.support]}</Badge>
                  {e.note && <span className="text-muted-foreground">{e.note}</span>}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {report.gaps.length > 0 && (
        <Section title="Missing or inconsistent">
          <ul className="list-disc space-y-1 pl-5 text-foreground-soft">
            {report.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Section>
      )}
      {report.questions.length > 0 && (
        <Section title="Questions the panel may ask">
          <ul className="list-disc space-y-1 pl-5 text-foreground-soft">
            {report.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}
      {report.injectionWarnings.length > 0 && (
        <Section title="Instruction-like text found in the evidence">
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
        <CircleDashed className="size-3" /> {report.model ?? "AI"} · {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : ""} · not stored
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

