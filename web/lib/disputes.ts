import { encodeAbiParameters, keccak256, toHex, type Address, type Hash } from "viem";
import { z } from "zod";
import { DISPUTES_ADDRESS } from "./env";

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

export const STATUS_LABEL: Record<DisputeStatus, string> = {
  [DisputeStatus.Open]: "Open",
  [DisputeStatus.UnderReview]: "Under review",
  [DisputeStatus.Resolved]: "Resolved",
  [DisputeStatus.Rejected]: "Rejected",
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

export const TRACK_LABEL: Record<Track, string> = {
  engine: "Verification Engine",
  panel: "Arbitration panel",
  parties: "Between the parties",
};

export const TRACK_TEXT: Record<Track, string> = {
  engine: "Settled by on-chain data. The Verification Engine re-checks it from the contracts; the panel only records the result.",
  panel: "A judgement call. The appointed arbitration panel weighs the evidence and publishes a reasoned decision.",
  parties: "A real-world obligation. The parties resolve it by negotiation or the mechanism they agreed on; Plinths keeps the evidence and the record.",
};

/** Reason codes (the contract accepts 0–5). `check` = the Verification Engine check that answers it. */
export const REASONS = [
  { code: 0, label: "Bid or reveal after the deadline", hint: "A bid or reveal accepted outside its window.", track: "engine", check: "deadlines" },
  { code: 1, label: "Reveal does not match its sealed bid", hint: "A revealed price, salt or key that does not open the sealed commitment.", track: "engine", check: "reveals" },
  { code: 2, label: "Unfair evaluation", hint: "The award does not follow the published criteria or reasoning.", track: "panel" },
  { code: 3, label: "Suspected fraudulent proposal", hint: "False documents, ineligible bidder, or collusion.", track: "panel" },
  { code: 4, label: "NFT or payout not delivered", hint: "An NFT, deposit or bond that did not go where the rules say after settlement.", track: "engine", check: "settlement" },
  { code: 5, label: "Quality of goods or services", hint: "Delivery after the award did not meet what was agreed.", track: "parties" },
] as const satisfies readonly { code: number; label: string; hint: string; track: Track; check?: "deadlines" | "reveals" | "settlement" }[];

export const reasonOf = (code: number) => REASONS.find((r) => r.code === code);

export const reasonLabel = (code: number) => reasonOf(code)?.label ?? "Unknown";

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

export function targetLabel(kind: TargetKind, targetId: bigint): string {
  return kind === TargetKind.Tender ? `Tender #${targetId}` : `NFT auction #${targetId}`;
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

export const PARTY_LABEL: Record<Party, string> = {
  opener: "Opened the dispute",
  arbiter: "Arbitration panel",
  buyer: "Buyer",
  seller: "Seller",
  bidder: "Bidder",
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
export const DISPUTE_ERROR_TEXT: Record<string, string> = {
  DisputeNotFound: "This dispute does not exist.",
  DisputeClosed: "This dispute is closed; no more responses or decisions.",
  NotArbiter: "Only the arbitration panel's account can change a dispute's status.",
  EmptyEvidence: "Add an evidence document.",
  InvalidReason: "Pick a reason.",
  InvalidStatus: "That status change is not allowed.",
};
