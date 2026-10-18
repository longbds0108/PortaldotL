import { bytesToHex, hexToBytes, type Hex } from "viem";

/*
 * The market stores documents as a 32-byte digest instead of a URI string (storage deposits on PortaldotV3 make
 * strings expensive). The digest is the SHA-256 inside an IPFS CIDv1:
 *   - raw codec (0x55, "bafkrei…") for single-block files — the digest is sha256 of the bytes;
 *   - dag-pb codec (0x70, "bafybei…") for files Pinata chunks — the digest is of the root node.
 * The codec is not stored, so readers try raw first and fall back to dag-pb (see candidateUris).
 * The local dev store (devipfs://<sha256 hex>) uses the same sha256, so it maps 1:1 as well.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const RAW = 0x55;
const DAG_PB = 0x70;
const SHA2_256 = 0x12;

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 CID");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function unbase58(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("Invalid base58 CID");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(68, "0");
  return hexToBytes(`0x${hex}`);
}

/** CIDv1 (base32) for a sha2-256 digest with the given codec. */
export function digestToCid(digest: Hex, codec: "raw" | "dag-pb" = "raw"): string {
  const d = hexToBytes(digest);
  if (d.length !== 32) throw new Error("digest must be 32 bytes");
  return `b${base32(new Uint8Array([0x01, codec === "raw" ? RAW : DAG_PB, SHA2_256, 0x20, ...d]))}`;
}

/** 32-byte digest of an uploaded document URI (ipfs://CIDv1, ipfs://Qm… CIDv0, or devipfs://<sha256>). */
export function uriToDigest(uri: string): Hex {
  if (uri.startsWith("devipfs://")) {
    const id = uri.slice("devipfs://".length);
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("Unexpected dev-store id");
    return `0x${id}`;
  }
  if (!uri.startsWith("ipfs://")) throw new Error("Only IPFS documents can be referenced on-chain");
  const cid = uri.slice("ipfs://".length).split("/")[0];
  let bytes: Uint8Array;
  if (cid.startsWith("Qm")) {
    bytes = unbase58(cid); // CIDv0 = bare sha2-256 multihash
  } else if (cid.startsWith("b")) {
    const all = unbase32(cid.slice(1));
    if (all[0] !== 0x01 || (all[1] !== RAW && all[1] !== DAG_PB)) throw new Error("Unsupported CID codec");
    bytes = all.slice(2);
  } else {
    throw new Error("Unsupported CID encoding");
  }
  if (bytes[0] !== SHA2_256 || bytes[1] !== 0x20 || bytes.length !== 34) throw new Error("CID is not sha2-256");
  return bytesToHex(bytes.slice(2));
}

/** Where a digest may live, in the order to try: IPFS raw, IPFS dag-pb, then the local dev store. */
export function candidateUris(digest: Hex): string[] {
  return [`ipfs://${digestToCid(digest, "raw")}`, `ipfs://${digestToCid(digest, "dag-pb")}`, `devipfs://${digest.slice(2)}`];
}

/** Canonical URI shown/stored in the app's view models for an on-chain digest (fetchers try every candidate). */
export function digestToUri(digest: Hex): string {
  return /^0x0{64}$/.test(digest) ? "" : `digest://${digest.slice(2)}`;
}

export function isDigestUri(uri: string): boolean {
  return uri.startsWith("digest://");
}

export function digestOfUri(uri: string): Hex {
  return `0x${uri.slice("digest://".length)}`;
}
