import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Server-side upload fallback. In normal operation the browser uploads straight to Pinata with a
 * presigned URL from /api/ipfs/sign (see lib/ipfs.ts). This handler is used for the local development
 * store (web/.dev-ipfs) when PINATA_JWT is unset — in development, or in a local production build with
 * ALLOW_LOCAL_IPFS=1. It never writes to disk on Vercel (read-only filesystem).
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;
const DEV_STORE = path.join(process.cwd(), ".dev-ipfs");

export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    // fallthrough
  }
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });

  // With Pinata configured the browser uploads directly via /api/ipfs/sign; this route never proxies to Pinata,
  // so it cannot be used to pin arbitrary files to the project's account.
  if (process.env.PINATA_JWT) {
    return NextResponse.json({ error: "Use /api/ipfs/sign (direct upload)" }, { status: 409 });
  }
  if (process.env.VERCEL || (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_IPFS !== "1")) {
    return NextResponse.json({ error: "IPFS is not configured: set PINATA_JWT" }, { status: 500 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = createHash("sha256").update(bytes).digest("hex");
  await mkdir(DEV_STORE, { recursive: true });
  await writeFile(path.join(DEV_STORE, id), bytes);
  await writeFile(path.join(DEV_STORE, `${id}.type`), file.type || "application/octet-stream");
  return NextResponse.json({ uri: `devipfs://${id}` });
}
