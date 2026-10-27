import { encodeAbiParameters, keccak256, toHex, type Address, type Hash } from "viem";
import { z } from "zod";
import { DISPUTES_ADDRESS } from "./env";
import { translator, type T, type Text } from "./i18n";

/*
 * Dispute Center: DisputeRegistry (contracts/src/DisputeRegistry.sol) keeps one storage slot per dispute; texts,
 * transaction hashes and attachments live in an evidence document on IPFS whose digest is in the event.
 * Storage layout, pinned by contracts/test/DisputeRegistry.t.sol (test_storageLayoutMatchesApp):
 *   slot 0  Dispute[] _disputes   (length; element i at keccak(0) + i)
 *   Dispute = opener(160) | kind(8) | status(8) | reason(8) | targetId(64)
 */

export const disputesAddress = DISPUTES_ADDRESS;
export const DISPUTES_SLOT = 0n;

export enum TargetKind {
  Tender = 0,
  NftAuction = 1,
}

export enum DisputeStatus {
  Open = 0,
  UnderReview = 1,
  Resolved = 2,
  Rejected = 3,
}

export const STATUS_LABEL: Record<DisputeStatus, Text> = {
  [DisputeStatus.Open]: ["Open", "Đang mở"],
  [DisputeStatus.UnderReview]: ["Under review", "Đang xem xét"],
  [DisputeStatus.Resolved]: ["Resolved", "Đã giải quyết"],
  [DisputeStatus.Rejected]: ["Rejected", "Bị bác"],
};

export const isClosed = (s: DisputeStatus) => s === DisputeStatus.Resolved || s === DisputeStatus.Rejected;

/**
 * Who settles a dispute depends on its type:
 *  - "engine":  rules the contracts enforce and on-chain data proves (Verification Engine; anyone can re-run it)
 *  - "panel":   judgement calls for the appointed arbitration panel
 *  - "parties": real-world obligations (quality of goods/services) — the parties' own agreed mechanism decides;
 *               Plinths only keeps the evidence and the record.
 */
export type Track = "engine" | "panel" | "parties";

export const TRACK_LABEL: Record<Track, Text> = {
  engine: ["Verification Engine", "Verification Engine"],
  panel: ["Arbitration panel", "Hội đồng trọng tài"],
  parties: ["Between the parties", "Giữa các bên"],
};

export const TRACK_TEXT: Record<Track, Text> = {
  engine: [
    "Settled by on-chain data. The Verification Engine re-checks it from the contracts; the panel only records the result.",
    "Giải quyết bằng dữ liệu on-chain. Verification Engine kiểm tra lại từ contract; hội đồng chỉ ghi nhận kết quả.",
  ],
  panel: [
    "A judgement call. The appointed arbitration panel weighs the evidence and publishes a reasoned decision.",
    "Cần phán xét. Hội đồng trọng tài được chỉ định cân nhắc bằng chứng và công bố quyết định kèm lý do.",
  ],
  parties: [
    "A real-world obligation. The parties resolve it by negotiation or the mechanism they agreed on; Plinths keeps the evidence and the record.",
    "Nghĩa vụ ngoài đời thực. Các bên tự giải quyết bằng thương lượng hoặc cơ chế đã thỏa thuận; Plinths lưu giữ bằng chứng và hồ sơ.",
  ],
};

/** Reason codes (the contract accepts 0–5). `check` = the Verification Engine check that answers it. */
export const REASONS = [
  {
    code: 0,
    label: ["Bid or reveal after the deadline", "Gửi giá hoặc công bố sau thời hạn"],
    hint: ["A bid or reveal accepted outside its window.", "Một lượt gửi giá hoặc công bố được chấp nhận ngoài khung thời gian."],
    track: "engine",
    check: "deadlines",
  },
  {
    code: 1,
    label: ["Reveal does not match its sealed bid", "Công bố không khớp giá niêm phong"],
    hint: [
      "A revealed price, salt or key that does not open the sealed commitment.",
      "Giá, salt hoặc khóa được công bố không mở được commitment đã niêm phong.",
    ],
    track: "engine",
    check: "reveals",
  },
  {
    code: 2,
    label: ["Unfair evaluation", "Đánh giá không công bằng"],
    hint: ["The award does not follow the published criteria or reasoning.", "Kết quả trao thầu không theo tiêu chí hoặc lập luận đã công bố."],
    track: "panel",
  },
  {
    code: 3,
    label: ["Suspected fraudulent proposal", "Nghi ngờ hồ sơ gian lận"],
    hint: ["False documents, ineligible bidder, or collusion.", "Tài liệu giả, nhà thầu không đủ điều kiện, hoặc thông đồng."],
    track: "panel",
  },
  {
    code: 4,
    label: ["NFT or payout not delivered", "Không nhận được NFT hoặc tiền"],
    hint: [
      "An NFT, deposit or bond that did not go where the rules say after settlement.",
      "NFT, tiền cọc hoặc tiền bảo đảm không đến đúng nơi theo quy tắc sau khi kết thúc.",
    ],
    track: "engine",
    check: "settlement",
  },
  {
    code: 5,
    label: ["Quality of goods or services", "Chất lượng hàng hóa hoặc dịch vụ"],
    hint: ["Delivery after the award did not meet what was agreed.", "Việc giao hàng sau khi trao thầu không đúng như đã thỏa thuận."],
    track: "parties",
  },
] as const satisfies readonly { code: number; label: Text; hint: Text; track: Track; check?: "deadlines" | "reveals" | "settlement" }[];

export const reasonOf = (code: number) => REASONS.find((r) => r.code === code);

const EN = translator("en");

export const reasonLabel = (code: number, t: T = EN) => {
  const r = reasonOf(code);
  return r ? t<string>(r.label[0], r.label[1]) : t("Unknown", "Không rõ");
};

export type DisputeCore = { opener: Address; kind: TargetKind; status: DisputeStatus; reason: number; targetId: bigint };

const bits = (w: bigint, offset: number, size: number) => (w >> BigInt(offset)) & ((1n << BigInt(size)) - 1n);

export function disputeSlot(id: bigint): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }], [DISPUTES_SLOT]))) + id;
}

export function decodeDispute(w: bigint): DisputeCore {
  return {
    opener: toHex(bits(w, 0, 160), { size: 20 }) as Address,
    kind: Number(bits(w, 160, 8)) as TargetKind,
    status: Number(bits(w, 168, 8)) as DisputeStatus,
    reason: Number(bits(w, 176, 8)),
    targetId: bits(w, 184, 64),
  };
}

/** Indexed `target` topic of DisputeOpened: (kind << 64) | targetId. */
export function targetKey(kind: TargetKind, targetId: bigint): bigint {
  return (BigInt(kind) << 64n) | targetId;
}

export function targetLabel(kind: TargetKind, targetId: bigint, t: T = EN): string {
  return kind === TargetKind.Tender ? t(`Tender #${targetId}`, `Gói thầu #${targetId}`) : t(`NFT auction #${targetId}`, `Đấu giá NFT #${targetId}`);
}

export function targetHref(kind: TargetKind, targetId: bigint): string {
  return kind === TargetKind.Tender ? `/tenders/${targetId}` : `/nft/${targetId}`;
}

// ───────────────────────── evidence documents (IPFS, public) ─────────────────────────

/** Attachments are embedded in the JSON (uploads are JSON-only by design). Images render inline; others download. */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ATTACHMENT_TYPES = [...INLINE_IMAGE_TYPES, "application/pdf", "text/plain"] as const;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // all attachments together
export const MAX_TX_HASHES = 10;

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const attachmentSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(ATTACHMENT_TYPES),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
  /** base64 of the file bytes */
  data: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8),
  /** sha256 of the bytes, so a copy can be checked */
  sha256: z.string().regex(HASH_RE),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const evidenceSchema = z.object({
  kind: z.literal("plinths-dispute-evidence"),
  v: z.literal(1),
  /** opening statement, response, or the arbiter's decision */
  role: z.enum(["opening", "response", "decision"]),
  title: z.string().max(140).optional(),
  text: z.string().min(1).max(5000),
  txHashes: z.array(z.string().regex(HASH_RE)).max(MAX_TX_HASHES).default([]),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
  createdAt: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** Splits free text into unique, well-formed transaction hashes (and the parts that are not hashes). */
export function parseTxHashes(input: string): { hashes: Hash[]; invalid: string[] } {
  const parts = input.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const hashes: Hash[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (HASH_RE.test(p)) {
      const h = p.toLowerCase() as Hash;
      if (!hashes.includes(h)) hashes.push(h);
    } else invalid.push(p);
  }
  return { hashes, invalid };
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return attachmentSchema.parse({
    name: file.name.slice(0, 120) || "attachment",
    type: file.type,
    size: bytes.length,
    data: btoa(bin),
    sha256: toHex(digest),
  });
}

export function attachmentBlob(a: Attachment): Blob {
  const bin = atob(a.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: a.type });
}

export const isInlineImage = (a: Attachment) => (INLINE_IMAGE_TYPES as readonly string[]).includes(a.type);

// ───────────────────────── evidence verification ─────────────────────────

/** An on-chain event of the disputed tender or auction (from its logs). */
export type TargetEvent = { name: string; txHash: Hash; blockNumber: bigint; actor?: Address };

export type TxCheck =
  | { hash: Hash; ok: true; events: TargetEvent[] }
  | { hash: Hash; ok: false };

/** A cited transaction is verified when it produced at least one event of the disputed tender or auction. */
export function verifyTxHashes(hashes: readonly string[], events: TargetEvent[]): TxCheck[] {
  return hashes.map((h) => {
    const hash = h.toLowerCase() as Hash;
    const matched = events.filter((e) => e.txHash.toLowerCase() === hash);
    return matched.length ? { hash, ok: true, events: matched } : { hash, ok: false };
  });
}

/** Roles a wallet holds in the disputed tender or auction, for labelling posts. */
export type Party = "opener" | "arbiter" | "buyer" | "seller" | "bidder";

export const PARTY_LABEL: Record<Party, Text> = {
  opener: ["Opened the dispute", "Người mở khiếu nại"],
  arbiter: ["Arbitration panel", "Hội đồng trọng tài"],
  buyer: ["Buyer", "Bên mời thầu"],
  seller: ["Seller", "Người bán"],
  bidder: ["Bidder", "Nhà thầu"],
};

export function partiesOf(
  account: Address,
  ctx: { opener: Address; arbiter?: Address; organizer?: Address; bidders: Address[]; kind: TargetKind },
): Party[] {
  const a = account.toLowerCase();
  const out: Party[] = [];
  if (ctx.arbiter && a === ctx.arbiter.toLowerCase()) out.push("arbiter");
  if (a === ctx.opener.toLowerCase()) out.push("opener");
  if (ctx.organizer && a === ctx.organizer.toLowerCase()) out.push(ctx.kind === TargetKind.Tender ? "buyer" : "seller");
  if (ctx.bidders.some((b) => b.toLowerCase() === a)) out.push("bidder");
  return out;
}

/** Contract custom errors → user-facing text. */
export const DISPUTE_ERROR_TEXT: Record<string, Text> = {
  DisputeNotFound: ["This dispute does not exist.", "Khiếu nại này không tồn tại."],
  DisputeClosed: ["This dispute is closed; no more responses or decisions.", "Khiếu nại đã đóng; không nhận thêm phản hồi hay quyết định."],
  NotArbiter: [
    "Only the arbitration panel's account can change a dispute's status.",
    "Chỉ tài khoản của hội đồng trọng tài mới đổi được trạng thái khiếu nại.",
  ],
  EmptyEvidence: ["Add an evidence document.", "Hãy thêm tài liệu bằng chứng."],
  InvalidReason: ["Pick a reason.", "Hãy chọn lý do."],
  InvalidStatus: ["That status change is not allowed.", "Không được đổi sang trạng thái đó."],
};
