import { z } from "zod";
import type { Text } from "./i18n";

/*
 * The /demo page shows a recorded lifecycle from public/demo/lifecycle.json, which tools/fairness-verifier builds from
 * a verifier report. It sends no transactions and has no simulated steps: every hash comes from the report. The
 * provenance tells the viewer where those transactions really happened.
 */
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const pair = z.tuple([z.string(), z.string()]);

const reportSchema = z.object({
  result: z.enum(["VERIFIED", "FAILED", "INCOMPLETE", "UNSUPPORTED"]),
  subject: z.object({ chainId: z.number(), contract: z.string(), contractVersion: z.union([z.literal(1), z.literal(2), z.null()]) }),
  outcome: z.object({ status: z.string(), winner: z.string().nullable(), winningAmount: z.string().nullable() }),
  budget: z.object({ min: z.string(), max: z.string() }).nullable(),
  revealSet: z.object({
    digest: hex32,
    onChainDigest: hex32.nullable(),
    entries: z.array(z.object({ bidder: z.string(), amount: z.string(), commitment: hex32 })),
    notRevealed: z.array(z.string()),
  }),
  references: z.array(z.object({ label: z.string(), txHash: hex32, blockNumber: z.string() })),
  checks: z.array(z.object({ id: z.string(), status: z.string(), required: z.boolean(), detail: z.string() })),
  limitations: z.array(z.string()),
});

export const lifecycleSchema = z.object({
  format: z.literal("plinths.demo/1"),
  provenance: z.enum(["LOCAL_CHAIN", "TESTNET_HISTORICAL"]),
  story: z.object({
    buyer: z.string(),
    need: pair,
    criteria: z.array(pair),
    bidders: z.record(z.string(), z.object({ name: z.string(), note: pair })),
    reason: pair,
  }),
  report: reportSchema,
});
export type Lifecycle = z.infer<typeof lifecycleSchema>;

export type StageKey = "create" | "bid" | "reveal" | "select" | "settle";

export const STAGES: { key: StageKey; title: Text; labels: string[]; say: Text }[] = [
  {
    key: "create",
    title: ["Create", "Tạo"],
    labels: ["TenderCreated"],
    say: [
      "The buyer publishes the need, the budget and the deadlines. Nobody can change them afterwards.",
      "Bên mời thầu công bố nhu cầu, ngân sách và thời hạn. Sau đó không ai sửa được.",
    ],
  },
  {
    key: "bid",
    title: ["Bid", "Nộp thầu"],
    labels: ["BidSubmitted", "BidReplaced"],
    say: [
      "Each bidder puts only a salted hash on-chain and uploads an encrypted proposal. Their address is public; their price is not.",
      "Mỗi nhà thầu chỉ đưa lên chain một mã băm có salt và tải lên hồ sơ đã mã hóa. Địa chỉ ví công khai, giá thì không.",
    ],
  },
  {
    key: "reveal",
    title: ["Reveal", "Công bố"],
    labels: ["BidRevealed"],
    say: [
      "After the deadline, bidders publish their price and key. The contract rejects anything that does not match the hash.",
      "Sau hạn nộp, nhà thầu công bố giá và khóa. Contract từ chối mọi giá trị không khớp mã băm.",
    ],
  },
  {
    key: "select",
    title: ["Select", "Chọn thầu"],
    labels: ["TenderAwarded"],
    say: [
      "The buyer chooses and publishes a reason. The contract accepts only a revealed bid inside the budget. The choice is still a human judgement.",
      "Bên mời thầu chọn và công bố lý do. Contract chỉ chấp nhận hồ sơ đã công bố và nằm trong ngân sách. Việc chọn vẫn là đánh giá của con người.",
    ],
  },
  {
    key: "settle",
    title: ["Settle", "Hoàn tất"],
    labels: ["BondWithdrawn", "ForfeitedBondsSwept"],
    say: [
      "Honest bidders take their bonds back, and an unrevealed bond goes to the treasury. Paying for the work itself happens off-chain: escrow is not built yet.",
      "Nhà thầu trung thực rút lại tiền bảo đảm, còn tiền của hồ sơ không công bố chuyển về treasury. Việc thanh toán hợp đồng diễn ra ngoài chain: escrow chưa được xây dựng.",
    ],
  },
];

export const PROVENANCE: Record<Lifecycle["provenance"], { badge: Text; detail: Text }> = {
  LOCAL_CHAIN: {
    badge: ["Recorded on a private local chain", "Ghi lại trên chain cục bộ riêng"],
    detail: [
      "These are real transactions on a throwaway anvil chain, with time moved forward. They are not on PortaldotV3 Testnet, and nothing happens live on this page.",
      "Đây là giao dịch thật trên chain anvil dùng một lần, có tua nhanh thời gian. Chúng không nằm trên PortaldotV3 Testnet, và trang này không chạy giao dịch trực tiếp nào.",
    ],
  },
  TESTNET_HISTORICAL: {
    badge: ["Recorded on PortaldotV3 Testnet", "Ghi lại trên PortaldotV3 Testnet"],
    detail: [
      "These are earlier transactions on PortaldotV3 Testnet, shown in sequence. Nothing happens live on this page.",
      "Đây là các giao dịch đã diễn ra trên PortaldotV3 Testnet, được hiển thị theo thứ tự. Trang này không chạy giao dịch trực tiếp nào.",
    ],
  },
};
