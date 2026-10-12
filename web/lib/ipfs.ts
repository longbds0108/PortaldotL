import { IPFS_GATEWAY } from "./env";

/**
 * Only public metadata and AES-GCM ciphertext are ever uploaded — never amount/salt/docKey.
 *
 * Upload path:
 *  1. POST /api/ipfs/sign → a short-lived Pinata presigned URL (PINATA_JWT stays server-side).
 *  2. The browser uploads the file straight to Pinata (no 4.5 MB serverless body limit on Vercel).
 *  If Pinata is not configured, the sign route answers {mode:"local"} and we fall back to /api/ipfs,
 *  which keeps files in the local development store.
 *
 * Supported URI schemes:
 *  - ipfs://<cid>     production (Pinata)
 *  - devipfs://<id>   local development store (web/.dev-ipfs, only when PINATA_JWT is unset)
 *  - data:...         inline metadata (used by the testnet seed script)
 */
export async function uploadJson(value: unknown, name = "data.json"): Promise<string> {
  const body = new Blob([JSON.stringify(value)], { type: "application/json" });
  return uploadBlob(body, name);
}

export async function uploadBlob(blob: Blob, name: string): Promise<string> {
  const sign = await fetch("/api/ipfs/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, size: blob.size }),
  });
  const signed = (await sign.json().catch(() => ({}))) as { mode?: string; url?: string; error?: string };

  if (sign.ok && signed.mode === "pinata" && signed.url) {
    const form = new FormData();
    form.append("file", blob, name);
    form.append("network", "public");
    const res = await fetch(signed.url, { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { data?: { cid?: string }; error?: { message?: string } };
    if (!res.ok || !json.data?.cid) throw new Error(json.error?.message || `IPFS upload failed (${res.status})`);
    return `ipfs://${json.data.cid}`;
  }
  if (sign.status !== 409 || signed.mode !== "local") {
    throw new Error(signed.error || `Upload failed (${sign.status})`);
  }

  // Local development store
  const form = new FormData();
  form.append("file", blob, name);
  const res = await fetch("/api/ipfs", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { uri?: string; error?: string };
  if (!res.ok || !json.uri) throw new Error(json.error || `Upload failed (${res.status})`);
  return json.uri;
}

export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAY + uri.slice("ipfs://".length);
  if (uri.startsWith("devipfs://")) return `/api/ipfs/dev/${encodeURIComponent(uri.slice("devipfs://".length))}`;
  if (uri.startsWith("data:") || uri.startsWith("https://") || uri.startsWith("http://")) return uri;
  throw new Error(`Unsupported URI: ${uri.slice(0, 32)}`);
}

export async function fetchJson(uri: string): Promise<unknown> {
  const res = await fetch(resolveUri(uri));
  if (!res.ok) throw new Error(`Could not load ${uri.slice(0, 40)} (${res.status})`);
  return res.json();
}
