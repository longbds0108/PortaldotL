"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ConfigGate, WalletGate } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TenderCard } from "@/components/tender-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TenderState } from "@/lib/contracts";
import { useMyTenderIds, useTenders } from "@/lib/hooks";

export default function MyTendersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Buyer workspace"
        title="My Tenders"
        description="Tenders created by the connected wallet."
        actions={
          <Button asChild>
            <Link href="/tenders/new">
              <Plus /> Create tender
            </Link>
          </Button>
        }
      />
      <ConfigGate>
        <WalletGate>
          <MyTenders />
        </WalletGate>
      </ConfigGate>
    </>
  );
}

function MyTenders() {
  const ids = useMyTenderIds();
  const { rows, isLoading } = useTenders(ids.data ?? []);
  if (ids.isLoading || (isLoading && (ids.data?.length ?? 0) > 0)) return <Skeleton className="h-40" />;
  if (!ids.data?.length) {
    return (
      <EmptyState
        title="No tenders yet"
        action={
          <Button asChild>
            <Link href="/tenders/new">Create a tender</Link>
          </Button>
        }
      >
        Tenders you publish from this wallet will appear here.
      </EmptyState>
    );
  }
  const toEvaluate = rows.filter((r) => r.state === TenderState.Evaluation);
  return (
    <div className="space-y-6">
      {toEvaluate.length > 0 && (
        <Card className="border-primary/40 bg-accent/40">
          <CardContent className="flex flex-col gap-2 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              {toEvaluate.length} tender{toEvaluate.length > 1 ? "s are" : " is"} ready for evaluation.
            </p>
            <Button asChild size="sm">
              <Link href={`/tenders/${toEvaluate[0].id}/evaluate`}>Evaluate now</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <TenderCard key={r.id.toString()} row={r} />
        ))}
      </div>
    </div>
  );
}
