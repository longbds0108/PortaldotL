import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";
import { tr } from "./i18n";

/**
 * Bidder secrets needed to reveal: amount, salt and docKey.
 * Losing them = cannot reveal = bond forfeited. So:
 *  - the downloaded backup file is the primary copy (mandatory before submitting),
 *  - localStorage is a convenience copy only (may be empty, may throw — always try/catch).
 * Nothing here ever leaves the browser.
 */
const hex32 = z.string().refine((v) => isHex(v) && v.length === 66, "expected 32-byte hex");
const address = z
  .string()
  .refine((v) => isAddress(v), "invalid address")
  .transform((v) => getAddress(v));
const uintString = z.string().regex(/^\d+$/, "expected an integer string");

export const vaultEntrySchema = z.object({
  v: z.literal(1),
  chainId: z.number().int(),
  contract: address,
  tenderId: uintString,
  bidder: address,
  /** tPOTv3 18 decimals, decimal string */
  amount18: uintString,
  salt: hex32,
  docKey: hex32,
  encryptedDocURI: z.string().optional(),
  createdAt: z.number().int(),
});
export type VaultEntry = z.infer<typeof vaultEntrySchema>;

const backupFileSchema = z.union([
  vaultEntrySchema.transform((e) => [e]),
  z.object({ kind: z.literal("blindbid-backup"), entries: z.array(vaultEntrySchema) }).transform((f) => f.entries),
]);

const STORAGE_KEY = "blindbid.vault.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function vaultKey(e: { chainId: number; contract: Address; tenderId: string | bigint; bidder: Address }) {
  return `${e.chainId}:${getAddress(e.contract)}:${e.tenderId.toString()}:${getAddress(e.bidder)}`;
}

function readAll(storage = defaultStorage()): Record<string, VaultEntry> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, VaultEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const r = vaultEntrySchema.safeParse(v);
      if (r.success) out[k] = r.data;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns false if the browser refused to store it (private mode, quota, blocked storage). */
export function saveEntries(entries: VaultEntry[], storage = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    const all = readAll(storage);
    for (const e of entries) all[vaultKey(e)] = e;
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function getEntry(
  q: { chainId: number; contract: Address; tenderId: bigint; bidder: Address },
  storage = defaultStorage(),
): VaultEntry | undefined {
  return readAll(storage)[vaultKey(q)];
}

export function listEntries(storage = defaultStorage()): VaultEntry[] {
  return Object.values(readAll(storage)).sort((a, b) => b.createdAt - a.createdAt);
}

export function toBackupJson(entries: VaultEntry[]): string {
  return JSON.stringify({ kind: "blindbid-backup", exportedAt: new Date().toISOString(), entries }, null, 2);
}

/** Accepts a single-bid backup or a full vault export. Throws a readable error on bad files. */
export function parseBackup(text: string): VaultEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(tr("Backup file is not valid JSON", "File sao lưu không phải JSON hợp lệ"));
  }
  const r = backupFileSchema.safeParse(json);
  if (!r.success) throw new Error(tr("Not a Plinths backup file", "Đây không phải file sao lưu của Plinths"));
  return r.data;
}

export function entrySecrets(e: VaultEntry): { amount18: bigint; salt: Hex; docKey: Hex } {
  return { amount18: BigInt(e.amount18), salt: e.salt as Hex, docKey: e.docKey as Hex };
}

export function downloadTextFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
