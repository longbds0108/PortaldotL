import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { digestToCid } from "@/lib/cid";
import { IPFS_GATEWAY } from "@/lib/env";

/*
 * Cached document proxy for on-chain digests (lib/cid.ts). IPFS content never changes for a given digest, so the
 * first fetch is cached forever by the Vercel CDN and browsers — later visitors get tender metadata, award reasons
 * and AI reports instantly instead of waiting 4–7 s on a public gateway.
 *   - races several gateways and takes the first good answer;
 *   - raw-codec documents are checked against the digest (sha256), so a misbehaving gateway cannot swap content;
 *   - documents above MAX_INLINE (large encrypted proposals) are redirected to the gateway that has them, because
 *     serverless responses are size-capped.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_INLINE = 4 * 1024 * 1024;
const GATEWAY_TIMEOUT_MS = 8_000;
const GATEWAYS = [...new Set([IPFS_GATEWAY, "https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"])];
const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

type Doc = { body: Uint8Array<ArrayBuffer>; type: string } | { redirect: string };

// Per-instance memory cache in front of the CDN (small documents only).
const memory = new Map<string, { body: Uint8Array<ArrayBuffer>; type: string }>();
const MEMORY_MAX = 300;

async function fromGateway(gateway: string, cid: string, digest: string, verify: boolean): Promise<Doc> {
  const url = gateway + cid;
  const res = await fetch(url, { signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(String(res.status));
  if (Number(res.headers.get("content-length") ?? 0) > MAX_INLINE) {
    void res.body?.cancel();
    return { redirect: url };
  }
  const body = new Uint8Array(await res.arrayBuffer());
  if (body.length > MAX_INLINE) return { redirect: url };
  if (verify && createHash("sha256").update(body).digest("hex") !== digest) throw new Error("digest mismatch");
  return { body, type: res.headers.get("content-type") ?? "application/octet-stream" };
}

async function fromDevStore(digest: string): Promise<Doc | undefined> {
  if (process.env.VERCEL) return undefined;
  const dir = path.join(process.cwd(), ".dev-ipfs");
  try {
    const [bytes, type] = await Promise.all([
      readFile(path.join(dir, digest)),
      readFile(path.join(dir, `${digest}.type`), "utf8").catch(() => "application/octet-stream"),
    ]);
    return { body: new Uint8Array(bytes), type };
  } catch {
    return undefined;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params;
  if (!/^[0-9a-f]{64}$/.test(digest)) return NextResponse.json({ error: "Invalid digest" }, { status: 400 });

  let doc: Doc | undefined = memory.get(digest) ?? (await fromDevStore(digest));
  if (!doc) {
    // Every gateway × both codecs at once: the first verified answer wins, a miss costs one timeout.
    const attempts = (["raw", "dag-pb"] as const).flatMap((codec) => {
      const cid = digestToCid(`0x${digest}` as Hex, codec);
      return GATEWAYS.map((g) => fromGateway(g, cid, digest, codec === "raw"));
    });
    doc = await Promise.any(attempts).catch(() => undefined);
  }
  if (!doc) return NextResponse.json({ error: "Not found on IPFS yet" }, { status: 404, headers: { "cache-control": "no-store" } });
  if ("redirect" in doc) return NextResponse.redirect(doc.redirect, { status: 307, headers: { "cache-control": IMMUTABLE } });

  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(digest, doc);
  return new NextResponse(doc.body, { headers: { "content-type": doc.type, "cache-control": IMMUTABLE } });
}
