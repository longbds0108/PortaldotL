import { NextResponse } from "next/server";

/**
 * Issues a short-lived Pinata presigned upload URL so the browser uploads straight to Pinata.
 * Needed on Vercel, where function request bodies are capped at 4.5 MB (encrypted proposals can be ~27 MB).
 * PINATA_JWT never leaves the server. The URL only accepts JSON (all Hedgora uploads are JSON:
 * tender metadata, AES-GCM envelopes, award reasons), expires after 2 minutes and is size-capped.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  // No Pinata configured: tell the client to use the local development store instead.
  if (!jwt) return NextResponse.json({ mode: "local" }, { status: 409 });

  let name = "hedgora.json";
  let size = 0;
  try {
    const body = (await req.json()) as { name?: unknown; size?: unknown };
    if (typeof body.name === "string") name = body.name.replace(/[^\w.\-]/g, "_").slice(0, 80) || name;
    if (typeof body.size === "number") size = body.size;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Invalid size" }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large (max 32 MB)" }, { status: 413 });

  const res = await fetch("https://uploads.pinata.cloud/v3/files/sign", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      date: Math.floor(Date.now() / 1000),
      expires: 120,
      network: "public",
      filename: name,
      max_file_size: MAX_UPLOAD_BYTES,
      allow_mime_types: ["application/json"],
    }),
  });
  if (!res.ok) return NextResponse.json({ error: `Could not authorise upload (${res.status})` }, { status: 502 });
  const json = (await res.json()) as { data?: string };
  if (!json.data) return NextResponse.json({ error: "Could not authorise upload" }, { status: 502 });
  return NextResponse.json({ mode: "pinata", url: json.data });
}
