import { describe, expect, it } from "vitest";
import { bidRisks } from "./risk";

const base = { submissionDeadline: 1_000_000n, revealDeadline: 1_000_000n + 86_400n, bidBond: 0n, budgetMax: 10_000_000_000n }; // $10,000 max

describe("bidRisks", () => {
  it("no warnings for a 24h window and no bond", () => {
    expect(bidRisks(base).warnings).toEqual([]);
    expect(bidRisks(base).revealWindowS).toBe(86_400);
  });

  it("flags a reveal window shorter than 24h as high risk", () => {
    const r = bidRisks({ ...base, revealDeadline: base.submissionDeadline + 3_600n, bidBond: 10n ** 18n });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].level).toBe("high");
    expect(r.warnings[0].text).toMatch(/Short reveal window: only 1h 0m 0s.*bond is lost/);
  });

  it("flags a bond above 5% of the max budget", () => {
    // 5% of $10,000 = $500; $500.01 is flagged, $500 is not ($500 > $100 though, so use a $1,000 budget for the edge)
    const small = { ...base, budgetMax: 1_000_000_000n }; // $1,000 → 5% = $50
    expect(bidRisks({ ...small, bidBond: 50n * 10n ** 18n }).warnings).toEqual([]);
    expect(bidRisks({ ...small, bidBond: 51n * 10n ** 18n }).warnings[0].level).toBe("medium");
  });

  it("flags a bond above $100 even on a large budget", () => {
    const big = { ...base, budgetMax: 1_000_000_000_000n }; // $1,000,000
    expect(bidRisks({ ...big, bidBond: 100n * 10n ** 18n }).warnings).toEqual([]);
    expect(bidRisks({ ...big, bidBond: 101n * 10n ** 18n }).warnings[0].text).toMatch(/High bid bond: \$101\.00/);
  });
});
