import { keccak256, toBytes, type Address, type Hex } from "viem";
import { z } from "zod";

export const agentAnalysisSchema = z.object({
  overallSummary: z.string().min(1).max(5000),
  bids: z.array(z.object({
    bidder: z.string().min(1).max(64),
    summary: z.string().min(1).max(2500),
    price: z.string().min(1).max(1000),
    timeline: z.string().min(1).max(1500),
    conditions: z.string().min(1).max(1500),
    gaps: z.array(z.string().max(500)).max(12),
    citations: z.array(z.object({
      claim: z.string().min(1).max(300),
      quote: z.string().min(1).max(700),
    })).max(12),
  })).min(1).max(50),
  injectionWarnings: z.array(z.object({
    bidder: z.string().min(1).max(64),
    quote: z.string().min(1).max(300),
  })).max(50),
});

export const agentReportSchema = agentAnalysisSchema.extend({
  version: z.literal(1),
  tenderId: z.string().regex(/^\d+$/),
  model: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
});

export type AgentAnalysis = z.infer<typeof agentAnalysisSchema>;
export type AgentReport = z.infer<typeof agentReportSchema>;

export function agentReportKey(chainId: number, contract: Address, tenderId: bigint): string {
  return `plinths.agent-report.v1:${chainId}:${contract.toLowerCase()}:${tenderId}`;
}

export function hashAgentReport(report: AgentReport): Hex {
  return keccak256(toBytes(JSON.stringify(report)));
}

export function readAgentReport(key: string): { report: AgentReport; hash: Hex } | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = z.object({ report: agentReportSchema, hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(JSON.parse(raw));
    const hash = hashAgentReport(entry.report);
    if (hash.toLowerCase() !== entry.hash.toLowerCase()) return undefined;
    return { report: entry.report, hash };
  } catch {
    return undefined;
  }
}
