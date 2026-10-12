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

/** Award justification (IPFS) referenced by `reasonURI`. Published only at award time. */
export const awardReasonSchema = z.object({
  version: z.literal(1),
  tenderId: z.string(),
  winner: z.string(),
  reason: z.string().min(1).max(5000),
  decidedAt: z.string(),
});
export type AwardReason = z.infer<typeof awardReasonSchema>;
