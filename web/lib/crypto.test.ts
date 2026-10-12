import { describe, expect, it } from "vitest";
import { decryptDocument, encryptDocument, fromBase64, generateDocKey, toBase64 } from "./crypto";

describe("document encryption", () => {
  const doc = { name: "proposal (final).pdf", type: "application/pdf", bytes: new Uint8Array([1, 2, 3, 250, 0, 7]) };

  it("round-trips content, name and type", async () => {
    const key = generateDocKey();
    const env = await encryptDocument(doc, key);
    expect(env.alg).toBe("AES-256-GCM");
    expect(JSON.stringify(env)).not.toContain("proposal");
    const out = await decryptDocument(env, key);
    expect(out.name).toBe(doc.name);
    expect(out.type).toBe(doc.type);
    expect([...out.bytes]).toEqual([...doc.bytes]);
  });

  it("rejects the wrong key and tampered ciphertext", async () => {
    const env = await encryptDocument(doc, generateDocKey());
    await expect(decryptDocument(env, generateDocKey())).rejects.toThrow();

    const key = generateDocKey();
    const env2 = await encryptDocument(doc, key);
    const ct = fromBase64(env2.ct);
    ct[0] ^= 1;
    await expect(decryptDocument({ ...env2, ct: toBase64(ct) }, key)).rejects.toThrow();
  });

  it("handles large files", async () => {
    const big = new Uint8Array(3_000_000).map((_, i) => i % 251);
    const key = generateDocKey();
    const out = await decryptDocument(await encryptDocument({ name: "a", type: "b", bytes: big }, key), key);
    expect(out.bytes.length).toBe(big.length);
    expect(out.bytes[2_999_999]).toBe(big[2_999_999]);
  });
});
