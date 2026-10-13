import { MIN_REVEAL_WINDOW_S, type Tender } from "./contracts";
import { formatDuration, formatNativeWei } from "./format";

/** Bond above this share of the maximum budget (or above HIGH_BOND_ABS_6) is flagged as unusually high. */
const HIGH_BOND_BPS = 500n; // 5%
const HIGH_BOND_ABS_6 = 100_000_000n; // 100 USDC (6 decimals)

export function bidRisks(tender: Pick<Tender, "submissionDeadline" | "revealDeadline" | "bidBond" | "budgetMax">) {
  const revealWindowS = Number(tender.revealDeadline - tender.submissionDeadline);
  const bond6 = tender.bidBond / 10n ** 12n; // native 18-decimal wei → 6-decimal USDC
  const warnings: { level: "high" | "medium"; text: string }[] = [];
  if (revealWindowS < MIN_REVEAL_WINDOW_S) {
    warnings.push({
      level: "high",
      text: `Short reveal window: only ${formatDuration(revealWindowS)}. If you miss it, your bid is excluded${tender.bidBond > 0n ? " and your bond is lost" : ""}.`,
    });
  }
  if (tender.bidBond > 0n && (bond6 * 10_000n > tender.budgetMax * HIGH_BOND_BPS || bond6 > HIGH_BOND_ABS_6)) {
    warnings.push({
      level: "medium",
      text: `High bid bond: ${formatNativeWei(tender.bidBond)} (above 5% of the maximum budget or above $100). You get it back only if you reveal in time.`,
    });
  }
  return { revealWindowS, warnings };
}
