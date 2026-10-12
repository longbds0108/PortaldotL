import { bytesToHex, hexToBytes, type Hex } from "viem";
import { z } from "zod";

/**
 * Client-side document encryption (AES-256-GCM via WebCrypto — no hand-rolled crypto).
 * The file name and MIME type are encrypted together with the content so nothing about the
 * bid document leaks through IPFS before reveal.
 *
 * Plaintext layout: [u32 BE header length][header JSON {name,type}][file bytes]
 * Envelope (uploaded to IPFS): { v: 1, alg: "AES-256-GCM", iv: base64, ct: base64 }
 */
export const encryptedEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("AES-256-GCM"),
  iv: z.string(),
  ct: z.string(),
});
export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

export type PlainDocument = { name: string; type: string; bytes: Uint8Array<ArrayBuffer> };

const subtle = () => globalThis.crypto.subtle;

/** Fresh random AES-256 key, as the raw 32 bytes in hex (this is the on-chain `docKey`). */
export function generateDocKey(): Hex {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

async function importKey(docKey: Hex, usage: KeyUsage): Promise<CryptoKey> {
  const raw = new Uint8Array(hexToBytes(docKey));
  if (raw.length !== 32) throw new Error("docKey must be 32 bytes");
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
}

export async function encryptDocument(doc: PlainDocument, docKey: Hex): Promise<EncryptedEnvelope> {
  const header = new TextEncoder().encode(JSON.stringify({ name: doc.name, type: doc.type }));
  const plain = new Uint8Array(4 + header.length + doc.bytes.length);
  new DataView(plain.buffer).setUint32(0, header.length);
  plain.set(header, 4);
  plain.set(doc.bytes, 4 + header.length);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, await importKey(docKey, "encrypt"), plain);
  return { v: 1, alg: "AES-256-GCM", iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function decryptDocument(envelope: EncryptedEnvelope, docKey: Hex): Promise<PlainDocument> {
  const plain = new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      await importKey(docKey, "decrypt"),
      fromBase64(envelope.ct),
    ),
  );
  const headerLen = new DataView(plain.buffer).getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + headerLen))) as {
    name: string;
    type: string;
  };
  return { name: header.name, type: header.type, bytes: plain.slice(4 + headerLen) };
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
