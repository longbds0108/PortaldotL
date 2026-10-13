"use client";

import { ArrowRight, EyeOff, FileLock2, Gavel, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { ConfigGate } from "@/components/gates";
import { TenderCard } from "@/components/tender-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TenderState } from "@/lib/contracts";
import { formatNativeWei, formatNativeWeiFloor } from "@/lib/format";
import { useMyBidTenderIds, useMyLockedBonds, useMyTenderIds, useTenders, type TenderRow } from "@/lib/hooks";
import { NETWORK_NAME } from "@/lib/network";

export default function DashboardPage() {
  const { isConnected } = useAccount();
  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">Hedgora · {NETWORK_NAME}</p>
        <h1 className="title-sheen mt-3 max-w-[900px] text-[clamp(2.35rem,6vw,4.25rem)]">Public tenders. Sealed bids.</h1>
        <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-muted-foreground">
          Any wallet except the buyer can bid, but prices stay cryptographically hidden until the submission deadline —
          enforced by the Hedgora smart contract, not by a promise.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/marketplace">
              Browse tenders <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/tenders/new">
              Create a tender <span aria-hidden="true">↗</span>
            </Link>
          </Button>
        </div>
      </section>

      <ConfigGate>{isConnected ? <MySummary /> : <HowItWorks />}</ConfigGate>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Gavel, title: "Publish", text: "Buyer posts the scope (on IPFS), budget range and deadlines on-chain." },
    { icon: FileLock2, title: "Seal", text: "Bidders commit a hash of their price; proposals are encrypted in the browser." },
    { icon: EyeOff, title: "Reveal", text: "After the deadline, bidders open their bids; the contract checks the hash." },
    { icon: ShieldCheck, title: "Prove", text: "The award and a link to its justification are public; anyone can verify each revealed bid." },
  ];
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <Card key={s.title}>
          <CardHeader>
            <span className="empty-orb mb-3 size-10 rounded-[12px]">
              <s.icon className="size-4" />
            </span>
            <p className="eyebrow">Step {i + 1}</p>
            <CardTitle>{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-[0.82rem] leading-relaxed text-muted-foreground">{s.text}</CardContent>
        </Card>
      ))}
    </section>
  );
}

function MySummary() {
  const myTenderIds = useMyTenderIds();
  const myBidIds = useMyBidTenderIds();
  const myTenders = useTenders(myTenderIds.data ?? []);
  const myBidTenders = useTenders(myBidIds.data ?? []);
  const latest = useTenders();

  const { address } = useAccount();
  // Real wallet balance from the configured chain. Native USDC on Arc has 18 decimals (same balance as the 6-decimal ERC-20 view).
  const balance = useBalance({ address, query: { enabled: !!address, refetchInterval: 15_000 } });
  const bonds = useMyLockedBonds(myBidTenders.rows);

  const count = (rows: TenderRow[], states: TenderState[]) => rows.filter((r) => states.includes(r.state)).length;
  // Show "…" until values are actually read from the chain — never a placeholder zero.
  const tendersReady = myTenderIds.data !== undefined && !myTenders.isLoading;
  const bidsReady = myBidIds.data !== undefined && !myBidTenders.isLoading;
  const stats = [
    {
      label: "USDC balance",
      value: balance.data ? formatNativeWeiFloor(balance.data.value) : balance.isError ? "—" : "…",
      href: "/profile",
      hint: balance.isError ? "Balance unavailable" : `Wallet · ${NETWORK_NAME}`,
    },
    {
      label: "Locked in bid bonds",
      value: !bidsReady || (bonds.isLoading && myBidTenders.rows.length > 0) ? "…" : formatNativeWei(bonds.lockedWei),
      href: "/my/bids",
      hint: bonds.count ? `${bonds.count} bond${bonds.count > 1 ? "s" : ""} · withdrawable once revealed` : "No active bonds",
    },
    { label: "My tenders", value: myTenderIds.data?.length ?? "…", href: "/my/tenders", hint: "Published by this wallet" },
    { label: "Awaiting my evaluation", value: tendersReady ? count(myTenders.rows, [TenderState.Evaluation]) : "…", href: "/my/tenders", hint: "Reveal window closed" },
    { label: "My bids", value: myBidIds.data?.length ?? "…", href: "/my/bids", hint: "Sealed commitments" },
    { label: "Reveal window open", value: bidsReady ? count(myBidTenders.rows, [TenderState.Reveal]) : "…", href: "/my/bids", hint: "Reveal before the deadline" },
  ];

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <Card className="h-full transition-transform duration-200 group-hover:-translate-y-0.5">
              <CardContent className="grid min-h-[140px] content-between gap-3 pt-5 sm:pt-6">
                <span className="text-[0.75rem] text-[#918a96]">{s.label}</span>
                <strong className="text-[clamp(1.6rem,2.6vw,2.1rem)] font-normal tracking-[-0.04em] tabular-nums">{s.value}</strong>
                <small className="text-[0.68rem] text-[#77717d]">{s.hint}</small>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h2 className="mt-2 text-[1.35rem] font-normal tracking-[-0.035em]">Open for bids</h2>
          </div>
          <Link href="/marketplace" className="text-[0.75rem] text-[#d6d1d9] hover:text-[#c3d6ff]">
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>
        {latest.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.rows
              .filter((r) => r.state === TenderState.Open)
              .slice(0, 3)
              .map((r) => (
                <TenderCard key={r.id.toString()} row={r} />
              ))}
            {latest.rows.every((r) => r.state !== TenderState.Open) && (
              <p className="text-sm text-muted-foreground">No tenders are open right now.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
