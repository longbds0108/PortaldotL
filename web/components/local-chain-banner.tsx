import { TriangleAlert } from "lucide-react";
import { IS_LOCAL_CHAIN } from "@/lib/network";

/** Shown only when the app reads from a local chain, so nobody mistakes test balances for real ones. */
export function LocalChainBanner({ className = "" }: { className?: string }) {
  if (!IS_LOCAL_CHAIN) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-[12px] border border-[rgba(232,181,76,.3)] bg-[rgba(232,181,76,.08)] px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-[#ecc979] ${className}`}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Local test chain — balances, tenders and bids shown here are test data, not real Arc Testnet funds.
      </span>
    </div>
  );
}
