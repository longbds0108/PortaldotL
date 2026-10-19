"use client";

import { Ban, CheckCircle2, ChevronRight, Hourglass, Inbox, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Panel, Placeholder, StepList } from "@/components/insights/ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DisputeStatus, TRACK_TEXT, isClosed, reasonLabel, targetLabel } from "@/lib/disputes";
import { useArbiter, useDisputes, useEvidence, type DisputeView } from "@/lib/dispute-hooks";
import { formatDateTime, shortAddress } from "@/lib/format";
import { NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { TrackBadge } from "./engine";
import { DisputeStatusBadge } from "./parts";

export const PROCESS = [
  { title: "File", text: "Pick the tender or auction and the type of problem, explain it, cite transactions and attach files." },
  { title: "Evidence check", text: "Cited transactions are matched against the target's own on-chain events, and the Verification Engine re-checks the contract rules." },
  { title: "Discussion", text: "The organizer, bidders and anyone else can respond with more evidence. The Dispute Assistant can brief the panel." },
  { title: "Outcome on record", text: "Depending on the type, the engine result, the panel's reasoned decision, or the parties' settlement is recorded. It cannot be edited later." },
];

type Tab = "all" | "active" | "resolved" | "rejected" | "mine";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "mine", label: "My disputes" },
];

export function DisputeDashboard() {
  const { address } = useAccount();
  const { rows, isLoading, error } = useDisputes();
  const arbiter = useArbiter();
  const [tab, setTab] = useState<Tab>("all");
  const isArbiter = !!address && !!arbiter && address.toLowerCase() === arbiter.toLowerCase();

  const counts = {
    total: rows.length,
    active: rows.filter((r) => !isClosed(r.core.status)).length,
    resolved: rows.filter((r) => r.core.status === DisputeStatus.Resolved).length,
    rejected: rows.filter((r) => r.core.status === DisputeStatus.Rejected).length,
  };
  const mine = (r: DisputeView) => !!address && r.posts.some((p) => p.type !== "status" && p.author.toLowerCase() === address.toLowerCase());
  const shown = rows.filter((r) =>
    tab === "all"
      ? true
      : tab === "active"
        ? !isClosed(r.core.status)
        : tab === "resolved"
          ? r.core.status === DisputeStatus.Resolved
          : tab === "rejected"
            ? r.core.status === DisputeStatus.Rejected
            : mine(r),
  );

  return (
    <>
      <PageHeader
        eyebrow={`Proof of Fairness · ${NETWORK_NAME}`}
        title="Dispute Center"
        description="Raise a concern about a tender or an auction, back it with evidence checked against the chain, and follow it to an outcome everyone can read. Plinths provides the evidence and a transparent process; it is not a legal authority."
        actions={
          <Button asChild>
            <Link href="/disputes/new">
              <Plus /> New dispute
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Count icon={Scale} label="Total disputes" value={isLoading ? undefined : counts.total} />
          <Count icon={Hourglass} label="In progress" value={isLoading ? undefined : counts.active} />
          <Count icon={CheckCircle2} label="Resolved" value={isLoading ? undefined : counts.resolved} />
          <Count icon={Ban} label="Rejected" value={isLoading ? undefined : counts.rejected} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Panel eyebrow="Cases" title="Disputes" description="Every dispute is public. Open one to see its timeline, evidence and decision.">
            <div role="tablist" aria-label="Filter disputes" className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex min-h-[34px] items-center rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft transition-colors hover:text-foreground",
                    tab === t.key && "border-transparent bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {error ? (
              <p className="text-sm text-destructive">Could not load disputes: {error.message}</p>
            ) : isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : shown.length === 0 ? (
              <Placeholder icon={Inbox} title={tab === "mine" ? (address ? "You have no disputes" : "Connect your wallet") : "No disputes here"}>
                {tab === "mine" ? "Disputes you opened or responded to appear here." : "Nothing matches this filter yet."}
              </Placeholder>
            ) : (
              <ul className="space-y-2">
                {shown.map((r) => (
                  <DisputeRow key={r.id.toString()} row={r} />
                ))}
              </ul>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel eyebrow="Published process" title="From concern to decision">
              <StepList steps={PROCESS} />
              <Link href="/docs/disputes" className="inline-flex items-center gap-1 text-[0.78rem] text-link hover:underline">
                Full rules <ChevronRight className="size-3.5" />
              </Link>
            </Panel>
            <Panel eyebrow="Who decides" title="It depends on the problem">
              <ul className="space-y-3">
                {(["engine", "panel", "parties"] as const).map((t) => (
                  <li key={t} className="space-y-1">
                    <TrackBadge track={t} />
                    <p className="text-[0.74rem] leading-relaxed text-muted-foreground">{TRACK_TEXT[t]}</p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-overlay/[0.06] pt-3 text-[0.72rem] text-muted-foreground">
                Panel account <span className="font-mono text-link" title={arbiter}>{arbiter ? shortAddress(arbiter) : "…"}</span>
                {isArbiter && <span className="text-success-fg"> · you are connected as the panel</span>}
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function DisputeRow({ row }: { row: DisputeView }) {
  const opening = row.posts.find((p) => p.type === "opened");
  const doc = useEvidence(opening?.evidenceUri || undefined);
  const responses = row.posts.filter((p) => p.type === "response").length;
  return (
    <li>
      <Link
        href={`/disputes/${row.id}`}
        className="well flex flex-col gap-2 rounded-[14px] p-4 transition-colors hover:bg-overlay/[0.04] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
            <span className="font-mono">#{row.id.toString()}</span>· {targetLabel(row.core.kind, row.core.targetId)} · {reasonLabel(row.core.reason)}
          </p>
          <p className="truncate font-medium text-foreground">{doc.data?.title ?? (doc.isLoading ? "…" : reasonLabel(row.core.reason))}</p>
          <p className="text-[0.72rem] text-muted-foreground">
            Opened by {shortAddress(row.core.opener)}
            {row.openedAt > 0n ? ` · ${formatDateTime(row.openedAt)}` : ` · block #${row.openedBlock}`}
            {responses > 0 && ` · ${responses} response${responses === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DisputeStatusBadge status={row.core.status} />
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}

function Count({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value?: number }) {
  return (
    <div className="well flex flex-col gap-3 rounded-[15px] p-4">
      <span className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
        <Icon className="size-3.5 text-link" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[1.6rem] font-medium leading-none text-foreground tabular-nums">{value ?? "…"}</span>
    </div>
  );
}
