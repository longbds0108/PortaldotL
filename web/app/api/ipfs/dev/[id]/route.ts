import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Serves the local development IPFS stand-in (content-addressed by sha256). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const localAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_IPFS === "1";
  if (!localAllowed || !/^[0-9a-f]{64}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const dir = path.join(process.cwd(), ".dev-ipfs");
  try {
    const [bytes, type] = await Promise.all([
      readFile(path.join(dir, id)),
      readFile(path.join(dir, `${id}.type`), "utf8").catch(() => "application/octet-stream"),
    ]);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
