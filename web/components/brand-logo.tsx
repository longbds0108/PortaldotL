import Image from "next/image";
import mark from "@/public/brand/plinths-mark.png";
import { cn } from "@/lib/utils";

/**
 * Plinths lockup: existing geometric mark paired with a live text wordmark.
 */
export function BrandLogo({ onLight = false, className, priority = false }: { onLight?: boolean; className?: string; priority?: boolean }) {
  return (
    <span className={cn("inline-flex h-8 w-auto select-none items-center gap-2", className)}>
      <Image src={mark} alt="" sizes="32px" priority={priority} className="h-8 w-8 shrink-0" draggable={false} />
      <span className={cn("text-[1.08rem] font-semibold tracking-[-0.045em]", onLight ? "text-[#161922]" : "text-white")}>plinths</span>
    </span>
  );
}
