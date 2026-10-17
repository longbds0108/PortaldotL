import { describe, expect, it } from "vitest";
import { getEntry, listEntries, parseBackup, saveEntries, toBackupJson, type VaultEntry } from "./salt-vault";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const entry: VaultEntry = {
  v: 1,
  chainId: 420420777,
  contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  tenderId: "3",
  bidder: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  amount14: "7500000000",
  salt: `0x${"11".repeat(32)}`,
  docKey: `0x${"22".repeat(32)}`,
  createdAt: 1,
};

describe("salt vault", () => {
  it("saves and finds entries", () => {
    const s = memoryStorage();
    expect(saveEntries([entry], s)).toBe(true);
    expect(getEntry({ chainId: 420420777, contract: entry.contract, tenderId: 3n, bidder: entry.bidder }, s)).toEqual(entry);
    expect(getEntry({ chainId: 420420777, contract: entry.contract, tenderId: 4n, bidder: entry.bidder }, s)).toBeUndefined();
    expect(listEntries(s)).toHaveLength(1);
  });

  it("survives throwing or missing storage", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(saveEntries([entry], broken)).toBe(false);
    expect(listEntries(broken)).toEqual([]);
    expect(saveEntries([entry], undefined)).toBe(false);
  });

  it("round-trips backups (single entry and full export)", () => {
    expect(parseBackup(toBackupJson([entry]))).toEqual([entry]);
    expect(parseBackup(JSON.stringify(entry))).toEqual([entry]);
    expect(() => parseBackup("{}")).toThrow("Not a Plinths backup file");
    expect(() => parseBackup("nope")).toThrow("not valid JSON");
    expect(() => parseBackup(JSON.stringify({ ...entry, salt: "0x12" }))).toThrow();
  });
});
