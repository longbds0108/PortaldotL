"use client";

import type { ReactNode } from "react";
import { ConfigGate } from "@/components/gates";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTender, useTenderMetadata, type TenderRow } from "@/lib/hooks";
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
  const { row, notFound, isLoading, refetch } = useTender(id);
  const meta = useTenderMetadata(row?.tender.metadataURI);

  if (id === undefined || notFound) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Tender not found.</CardContent>
      </Card>
    );
  }
  if (isLoading || !row) return <Skeleton className="h-80" />;
  return <>{children({ row, meta: meta.data, refetch: () => void refetch() })}</>;
}
