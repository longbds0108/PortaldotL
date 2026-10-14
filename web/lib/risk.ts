import { MIN_REVEAL_WINDOW_S, type Tender } from "./contracts";
import { formatDuration, formatNativeAmount } from "./format";

/** Bond above this share of the maximum budget (or the 100 tPOTv3 absolute threshold) is flagged as high. */
const HIGH_BOND_BPS = 500n; // 5%
const HIGH_BOND_ABS = 100n * 10n ** 14n; // 100 tPOTv3

export function bidRisks(tender: Pick<Tender, "submissionDeadline" | "revealDeadline" | "bidBond" | "budgetMax">) {
  const revealWindowS = Number(tender.revealDeadline - tender.submissionDeadline);
  const warnings: { level: "high" | "medium"; text: string }[] = [];
  if (revealWindowS < MIN_REVEAL_WINDOW_S) {
    warnings.push({
      level: "high",
      text: `Short reveal window: only ${formatDuration(revealWindowS)}. If you miss it, your bid is excluded${tender.bidBond > 0n ? " and your bond is lost" : ""}.`,
    });
  }
  if (tender.bidBond > 0n && (tender.bidBond * 10_000n > tender.budgetMax * HIGH_BOND_BPS || tender.bidBond > HIGH_BOND_ABS)) {
    warnings.push({
      level: "medium",
      text: `High bid bond: ${formatNativeAmount(tender.bidBond)} (above 5% of the maximum budget or 100 tPOTv3). You get it back only if you reveal in time.`,
    });
  }
  return { revealWindowS, warnings };
}
