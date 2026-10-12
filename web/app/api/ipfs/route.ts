import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Uploads public metadata or AES-GCM ciphertext. Plaintext bid data never reaches this handler.
 * PINATA_JWT is server-only. Without it, files go to web/.dev-ipfs — in development, or in a local
 * production build when ALLOW_LOCAL_IPFS=1 (such files are readable only from this machine).
 */
export const runtime = "nodejs";

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

  const jwt = process.env.PINATA_JWT;
  if (jwt) {
    const body = new FormData();
    body.append("file", file, file.name || "blob");
    body.append("pinataMetadata", JSON.stringify({ name: file.name || "hedgora" }));
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body,
    });
    if (!res.ok) return NextResponse.json({ error: `IPFS pinning failed (${res.status})` }, { status: 502 });
    const json = (await res.json()) as { IpfsHash: string };
    return NextResponse.json({ uri: `ipfs://${json.IpfsHash}` });
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_IPFS !== "1") {
    return NextResponse.json({ error: "IPFS is not configured (PINATA_JWT)" }, { status: 500 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = createHash("sha256").update(bytes).digest("hex");
  await mkdir(DEV_STORE, { recursive: true });
  await writeFile(path.join(DEV_STORE, id), bytes);
  await writeFile(path.join(DEV_STORE, `${id}.type`), file.type || "application/octet-stream");
  return NextResponse.json({ uri: `devipfs://${id}` });
}
