import { describe, expect, it } from "vitest";
import { candidateUris, digestOfUri, digestToCid, digestToUri, uriToDigest } from "./cid";

// A real Pinata upload (Plinths test NFT #1 metadata): its CID's digest is the sha256 of the file's bytes.
const CID = "bafkreif7giatkqukhopkiz6edvna7culo6vw255n67fpjvx2ne4u4nw4sq";
const SHA256 = "0xbf320135428a3b9ea467c41d5a0f8a8b77ab6d77adf7caf4d6fa69394e36dc94";

describe("CID ↔ on-chain digest", () => {
  it("extracts the sha256 digest of a raw CIDv1 and rebuilds the same CID", () => {
    expect(uriToDigest(`ipfs://${CID}`)).toBe(SHA256);
    expect(digestToCid(SHA256, "raw")).toBe(CID);
  });

  it("round-trips dag-pb CIDs and maps the dev store by sha256", () => {
    const dagPb = digestToCid(SHA256, "dag-pb");
    expect(dagPb.startsWith("bafybei")).toBe(true);
    expect(uriToDigest(`ipfs://${dagPb}`)).toBe(SHA256);
    expect(uriToDigest(`devipfs://${SHA256.slice(2)}`)).toBe(SHA256);
  });

  it("decodes CIDv0 (Qm…) to the same digest as its CIDv1 dag-pb form", () => {
    // Empty UnixFS directory: CIDv0 QmUNLL… and CIDv1 bafybeiczsscdsbs7… are the same multihash.
    const v0 = uriToDigest("ipfs://QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn");
    expect(digestToCid(v0, "dag-pb")).toBe("bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354");
  });

  it("lists every place a digest may be fetched from, raw first", () => {
    const [raw, dag, dev] = candidateUris(SHA256);
    expect(raw).toBe(`ipfs://${CID}`);
    expect(dag.startsWith("ipfs://bafybei")).toBe(true);
    expect(dev).toBe(`devipfs://${SHA256.slice(2)}`);
  });

  it("wraps digests for view models and treats zero as empty", () => {
    expect(digestOfUri(digestToUri(SHA256))).toBe(SHA256);
    expect(digestToUri(`0x${"0".repeat(64)}`)).toBe("");
  });

  it("rejects what cannot be referenced on-chain", () => {
    expect(() => uriToDigest("data:application/json,{}")).toThrow();
    expect(() => uriToDigest("ipfs://bafyreiabc")).toThrow();
  });
});
