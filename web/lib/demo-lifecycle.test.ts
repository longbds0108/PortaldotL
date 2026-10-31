import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGES, lifecycleSchema } from "./demo-lifecycle";

const read = (p: string) => JSON.parse(readFileSync(resolve(__dirname, p), "utf8")) as unknown;

describe("recorded demo lifecycle", () => {
  const demo = lifecycleSchema.parse(read("../public/demo/lifecycle.json"));

  it("is the verifier's own report, unchanged", () => {
    expect((read("../public/demo/lifecycle.json") as { report: unknown }).report).toEqual(read("../../tools/fairness-verifier/test/fixtures/v2-awarded.report.json"));
  });

  it("states a provenance that fits its chain", () => {
    expect(demo.report.subject.chainId === 420420777).toBe(demo.provenance === "TESTNET_HISTORICAL");
  });

  it("has a real transaction for all five stages", () => {
    for (const stage of STAGES) {
      expect(demo.report.references.filter((r) => stage.labels.includes(r.label)).length, stage.key).toBeGreaterThan(0);
    }
  });

  it("marks the story as fictional", () => {
    expect(demo.story.buyer).toMatch(/fictional/);
  });
});
