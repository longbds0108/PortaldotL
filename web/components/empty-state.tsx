import { Sparkle } from "lucide-react";
import type { ReactNode } from "react";

/** Hedgora empty-state: dashed recessed box with a glowing orb. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="well grid min-h-[260px] place-content-center justify-items-center gap-3 rounded-[15px] border-dashed border-overlay/[0.12] p-8 text-center">
      <span className="empty-orb mb-1" aria-hidden="true">
        <Sparkle className="size-5" />
      </span>
      <strong className="text-base font-medium text-foreground">{title}</strong>
      {children && <p className="max-w-sm text-[0.82rem] text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}
