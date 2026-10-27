"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/lang-provider";
import { STATE_LABEL, TenderState } from "@/lib/contracts";

const VARIANT = {
  [TenderState.Open]: "success",
  [TenderState.Reveal]: "warning",
  [TenderState.Evaluation]: "secondary",
  [TenderState.Awarded]: "outline",
  [TenderState.Cancelled]: "muted",
  [TenderState.Failed]: "destructive",
} as const;

export function StateBadge({ state }: { state: TenderState }) {
  const t = useT();
  return (
    <Badge variant={VARIANT[state]} dot={state !== TenderState.Cancelled}>
      {t(STATE_LABEL[state])}
    </Badge>
  );
}
