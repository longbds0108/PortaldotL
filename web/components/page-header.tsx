import type { ReactNode } from "react";
import { NETWORK_NAME } from "@/lib/network";

/** Plinths page-heading: eyebrow label, large sheen title, muted intro. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow = `Plinths · ${NETWORK_NAME}`,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="title-sheen mt-3 max-w-[900px] text-[clamp(2rem,5vw,3.6rem)]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
