import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

/**
 * Secrets needed to reveal a sealed NFT bid: amount and salt.
 * Same rules as the tender vault (lib/salt-vault.ts): the downloaded backup file is the primary copy and is
 * required before bidding; localStorage is a convenience copy only. Nothing here ever leaves the browser.
 */
const hex32 = z.string().refine((v) => isHex(v) && v.length === 66, "expected 32-byte hex");
const address = z
  .string()
  .refine((v) => isAddress(v), "invalid address")
  .transform((v) => getAddress(v));
const uintString = z.string().regex(/^\d+$/, "expected an integer string");

export const nftVaultEntrySchema = z.object({
  v: z.literal(1),
  chainId: z.number().int(),
  contract: address,
  auctionId: uintString,
  bidder: address,
  /** tPOTv3 14 decimals, decimal string */
  amount14: uintString,
  /** tPOTv3 14 decimals locked with the bid (public on-chain; kept for reference) */
  deposit14: uintString,
  salt: hex32,
  createdAt: z.number().int(),
});
export type NftVaultEntry = z.infer<typeof nftVaultEntrySchema>;

const backupFileSchema = z.union([
  nftVaultEntrySchema.transform((e) => [e]),
  z.object({ kind: z.literal("plinths-nft-backup"), entries: z.array(nftVaultEntrySchema) }).transform((f) => f.entries),
]);

const STORAGE_KEY = "plinths.nft-vault.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function keyOf(e: { chainId: number; contract: Address; auctionId: string | bigint; bidder: Address }) {
  return `${e.chainId}:${getAddress(e.contract)}:${e.auctionId.toString()}:${getAddress(e.bidder)}`;
}

function readAll(storage = defaultStorage()): Record<string, NftVaultEntry> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const out: Record<string, NftVaultEntry> = {};
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
      const r = nftVaultEntrySchema.safeParse(v);
      if (r.success) out[k] = r.data;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns false if the browser refused to store it (private mode, quota, blocked storage). */
export function saveNftEntries(entries: NftVaultEntry[], storage = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    const all = readAll(storage);
    for (const e of entries) all[keyOf(e)] = e;
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function getNftEntry(
  q: { chainId: number; contract: Address; auctionId: bigint; bidder: Address },
  storage = defaultStorage(),
): NftVaultEntry | undefined {
  return readAll(storage)[keyOf(q)];
}

export function toNftBackupJson(entries: NftVaultEntry[]): string {
  return JSON.stringify({ kind: "plinths-nft-backup", exportedAt: new Date().toISOString(), entries }, null, 2);
}

/** Accepts a single-bid backup or a full export. Throws a readable error on bad files. */
export function parseNftBackup(text: string): NftVaultEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }
  const r = backupFileSchema.safeParse(json);
  if (!r.success) throw new Error("Not a Plinths NFT bid backup file");
  return r.data;
}

export function nftEntrySecrets(e: NftVaultEntry): { amount14: bigint; salt: Hex } {
  return { amount14: BigInt(e.amount14), salt: e.salt as Hex };
}
