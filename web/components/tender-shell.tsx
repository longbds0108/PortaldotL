"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ConfigGate } from "@/components/gates";
import { useT } from "@/components/lang-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTender, useTenderMetadata, type TenderRow } from "@/lib/hooks";
import { blindBidAddress, TenderState, type Tender } from "@/lib/contracts";
import type { TenderMetadata } from "@/lib/metadata";
import { useTenderIdParam } from "@/lib/use-tender-id";

/** Loads the tender from the route param and renders children once available. */
export function TenderShell({
  children,
}: {
  children: (ctx: { row: TenderRow; meta?: TenderMetadata; refetch: () => void }) => ReactNode;
}) {
  return (
    <ConfigGate>
      <Inner>{children}</Inner>
    </ConfigGate>
  );
}

function Inner({ children }: { children: (ctx: { row: TenderRow; meta?: TenderMetadata; refetch: () => void }) => ReactNode }) {
  const id = useTenderIdParam();
  const pathname = usePathname();
  const { row, notFound, isLoading, refetch } = useTender(id);
  const meta = useTenderMetadata(row?.tender.metadataURI);
  const t = useT();

  if (!blindBidAddress && id !== undefined) {
    const state = pathname.endsWith("/evaluate")
      ? TenderState.Evaluation
      : pathname.endsWith("/results")
        ? TenderState.Awarded
        : TenderState.Open;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const sampleTender: Tender = {
      buyer: "0x1111111111111111111111111111111111111111",
      submissionDeadline: now + 3n * 86_400n,
      revealDeadline: now + 5n * 86_400n,
      createdBlock: 1_234_000n,
      awardedBlock: state === TenderState.Awarded ? 1_234_500n : 0n,
      winner: "0x2222222222222222222222222222222222222222",
      bidCount: 4,
      revealedCount: state === TenderState.Evaluation || state === TenderState.Awarded ? 4 : 0,
      cancelled: false,
      awarded: state === TenderState.Awarded,
      forfeitSwept: false,
      budgetMin: 25_000n * 10n ** 18n,
      budgetMax: 40_000n * 10n ** 18n,
      bidBond: 100n * 10n ** 18n,
      metadataURI: "preview://tender",
      reasonURI: "",
    };
    const preview: TenderRow = { id, tender: sampleTender, state };
    const previewMeta: TenderMetadata = {
      version: 1,
      title: "PortaldotV3 Network Upgrade Services",
      category: "Technology",
      description: "Design and deliver a resilient monitoring dashboard and operational tooling for a public testnet marketplace.",
      eligibility: "Demonstrated experience with production web applications and blockchain integrations.",
      criteria: "Technical approach, delivery timeline, support plan, and total cost.",
      buyerName: "Plinths Demo Buyer",
    };
    return <>{children({ row: preview, meta: previewMeta, refetch: () => undefined })}</>;
  }

  if (id === undefined || notFound) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">{t("Tender not found.", "Không tìm thấy gói thầu.")}</CardContent>
      </Card>
    );
  }
  if (isLoading || !row) return <Skeleton className="h-80" />;
  return <>{children({ row, meta: meta.data, refetch: () => void refetch() })}</>;
}
