import { IPFS_GATEWAY } from "./env";

/**
 * Uploads go through our route handler (/api/ipfs) so PINATA_JWT stays server-side.
 * Only public metadata and AES-GCM ciphertext are ever uploaded — never amount/salt/docKey.
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
