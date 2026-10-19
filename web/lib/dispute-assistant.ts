import { z } from "zod";

/** Dispute Assistant report (AI). It prepares material for the arbitration panel; it never decides or recommends. */
export const assistantReportSchema = z.object({
  summary: z.string().max(4000),
  timeline: z.array(z.object({ when: z.string().max(120), event: z.string().max(600) })).max(40).default([]),
  evidence: z
    .array(
      z.object({
        point: z.string().max(600),
        support: z.enum(["on-chain", "document", "unsupported"]),
        note: z.string().max(600).default(""),
      }),
    )
    .max(30)
    .default([]),
  gaps: z.array(z.string().max(400)).max(20).default([]),
  questions: z.array(z.string().max(400)).max(15).default([]),
  injectionWarnings: z.array(z.object({ author: z.string().max(60), quote: z.string().max(400) })).max(10).default([]),
});
export type AssistantReport = z.infer<typeof assistantReportSchema>;

export const SUPPORT_LABEL: Record<AssistantReport["evidence"][number]["support"], string> = {
  "on-chain": "Backed by on-chain data",
  document: "Stated in a document only",
  unsupported: "No evidence given",
};
