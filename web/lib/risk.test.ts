import { describe, expect, it } from "vitest";
import { bidRisks } from "./risk";

const base = { submissionDeadline: 1_000_000n, revealDeadline: 1_000_000n + 86_400n, bidBond: 0n, budgetMax: 10_000n * 10n ** 14n }; // 10,000 tPOTv3 max

describe("bidRisks", () => {
  it("no warnings for a 24h window and no bond", () => {
    expect(bidRisks(base).warnings).toEqual([]);
    expect(bidRisks(base).revealWindowS).toBe(86_400);
  });

  it("flags a reveal window shorter than 24h as high risk", () => {
    const r = bidRisks({ ...base, revealDeadline: base.submissionDeadline + 3_600n, bidBond: 10n ** 14n });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].level).toBe("high");
    expect(r.warnings[0].text).toMatch(/Short reveal window: only 1h 0m 0s.*bond is lost/);
  });

  it("flags a bond above 5% of the max budget", () => {
    // Use a 1,000 tPOTv3 budget so its 5% bond threshold is below the 100 tPOTv3 absolute threshold.
    const small = { ...base, budgetMax: 1_000n * 10n ** 14n };
    expect(bidRisks({ ...small, bidBond: 50n * 10n ** 14n }).warnings).toEqual([]);
    expect(bidRisks({ ...small, bidBond: 51n * 10n ** 14n }).warnings[0].level).toBe("medium");
  });

  it("flags a bond above 100 tPOTv3 even on a large budget", () => {
    const big = { ...base, budgetMax: 1_000_000n * 10n ** 14n };
    expect(bidRisks({ ...big, bidBond: 100n * 10n ** 14n }).warnings).toEqual([]);
    expect(bidRisks({ ...big, bidBond: 101n * 10n ** 14n }).warnings[0].text).toMatch(/High bid bond: 101\.00 tPOTv3/);
  });
});
