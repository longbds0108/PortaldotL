import { z } from "zod";

export const CATEGORIES = ["Technology", "Construction", "Services"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Public tender metadata (IPFS). Never contains bid data. */
export const tenderMetadataSchema = z.object({
  version: z.literal(1),
  title: z.string().min(3).max(120),
  category: z.enum(CATEGORIES),
  description: z.string().min(10).max(5000),
  eligibility: z.string().max(2000).default(""),
  criteria: z.string().max(2000).default(""),
  buyerName: z.string().max(120).optional(),
});
export type TenderMetadata = z.infer<typeof tenderMetadataSchema>;

/**
 * Award justification (IPFS) whose digest is stored on-chain with the award. Published only at award time.
 * When the buyer used Plinths Agent, it links the published AI report and the report's keccak256 hash, so the
 * report is verifiable through the reason document (the contract stores nothing else).
 */
export const awardReasonSchema = z.object({
  version: z.literal(1),
  tenderId: z.string(),
  winner: z.string(),
  reason: z.string().min(1).max(5000),
  decidedAt: z.string(),
  aiSummaryURI: z.string().max(200).optional(),
  aiSummaryHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});
export type AwardReason = z.infer<typeof awardReasonSchema>;
