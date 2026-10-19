import { FileSearch, Inbox, Scale, ScrollText } from "lucide-react";
import { DesignNote, InDesignBadge, Panel, Placeholder, StepList } from "@/components/insights/ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DisputeDashboard } from "@/components/disputes/dashboard";
import { DISPUTES_ADDRESS } from "@/lib/env";
import { NETWORK_NAME } from "@/lib/network";

export const metadata = { title: "Dispute Center — Plinths" };

const TABS = ["Open", "Under review", "Resolved"];

const REASONS = ["Deadline or timing", "Reveal does not match", "Award reasoning", "Eligibility", "Something else"];

const PROCESS = [
  { title: "File", text: "Pick the tender or auction, the reason, and describe what went wrong." },
  { title: "Evidence pack", text: "Plinths attaches the on-chain timeline, commitments and verification results automatically." },
  { title: "Review", text: "The organizer answers and both sides can add documents." },
  { title: "Outcome on record", text: "The decision and its reasoning are published so anyone can read them later." },
];

/** Live once NEXT_PUBLIC_DISPUTES_ADDRESS is set; until then the design below. */
export default function DisputesPage() {
  if (DISPUTES_ADDRESS) return <DisputeDashboard />;
  return <DisputesPreview />;
}

function DisputesPreview() {
  return (
    <>
      <PageHeader
        eyebrow={`Proof of Fairness · ${NETWORK_NAME}`}
        title="Dispute Center"
        description="Raise a concern about a tender or an auction, back it with evidence from the chain, and follow it to an outcome everyone can see."
        actions={<InDesignBadge />}
      />
      <DesignNote>The layout is ready; filing and tracking disputes are not connected yet.</DesignNote>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel eyebrow="Your disputes" title="Cases">
            <div role="tablist" aria-label="Dispute status" className="flex flex-wrap gap-2">
              {TABS.map((t, i) => (
                <span
                  key={t}
                  role="tab"
                  aria-selected={i === 0}
                  className={
                    i === 0
                      ? "inline-flex min-h-[34px] items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] px-4 text-[0.76rem] text-foreground"
                      : "inline-flex min-h-[34px] items-center gap-2 rounded-full border border-overlay/10 px-4 text-[0.76rem] text-foreground-soft"
                  }
                >
                  {t} <span className="text-muted-foreground">—</span>
                </span>
              ))}
            </div>
            <Placeholder icon={Inbox} title="No disputes">
              Cases you file, or that are filed about your tenders and auctions, will appear here.
            </Placeholder>
          </Panel>

          <Panel eyebrow="Process" title="From concern to outcome">
            <StepList steps={PROCESS} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel eyebrow="New case" title="Open a dispute">
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="d-target">Tender or auction</Label>
                <Input id="d-target" placeholder="Tender #… or NFT auction #…" disabled />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <span key={r} className="rounded-full border border-overlay/10 px-3 py-1 text-[0.72rem] text-muted-foreground">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-text">What happened</Label>
                <Textarea id="d-text" rows={4} placeholder="Describe the problem and what you expected." disabled />
              </div>
              <div className="well flex items-start gap-3 rounded-[12px] p-3 text-[0.75rem] text-muted-foreground">
                <FileSearch className="mt-0.5 size-4 shrink-0 text-link" />
                The on-chain timeline and verification results of the selected tender or auction will be attached as evidence.
              </div>
              <Button type="button" className="w-full" disabled>
                <Scale /> File dispute
              </Button>
            </form>
          </Panel>

          <Panel eyebrow="Good to know" title="What a dispute can and cannot do">
            <ul className="space-y-3 text-[0.78rem] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <ScrollText className="mt-0.5 size-4 shrink-0 text-link" />
                It creates a public record with evidence. It does not reverse an award or a settlement already on-chain.
              </li>
              <li className="flex gap-2">
                <ScrollText className="mt-0.5 size-4 shrink-0 text-link" />
                Many concerns can be settled at once by the Verify button on a tender&apos;s Results page.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
