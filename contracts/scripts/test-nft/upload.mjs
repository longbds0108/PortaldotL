// Uploads the three test NFT images and their metadata JSON to IPFS (Pinata, public network)
// and writes scripts/test-nft/uris.json, which deploy-test-nft.cjs mints from.
//
//   PINATA_JWT=... node scripts/test-nft/upload.mjs
//
// The artwork is original SVG made for Plinths testing (scripts/test-nft/art). Test-only collection.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const jwt = process.env.PINATA_JWT;
if (!jwt) throw new Error("Set PINATA_JWT (same server-only key as web/.env.local).");

const ITEMS = [
  {
    file: "1-sealed-orb.svg",
    name: "Sealed Orb #1",
    description: "A price wrapped in a hash. Nobody can read it until the deadline says so.",
    attributes: [{ trait_type: "Phase", value: "Commit" }, { trait_type: "Palette", value: "Blue" }],
  },
  {
    file: "2-commit-prism.svg",
    name: "Commit Prism #2",
    description: "Three plinths, one commitment: tenderId, bidder and amount sealed together with a salt.",
    attributes: [{ trait_type: "Phase", value: "Commit" }, { trait_type: "Palette", value: "Violet" }],
  },
  {
    file: "3-reveal-key.svg",
    name: "Reveal Key #3",
    description: "The salt and key that open a sealed bid — checked by the contract, not trusted.",
    attributes: [{ trait_type: "Phase", value: "Reveal" }, { trait_type: "Palette", value: "Teal" }],
  },
];

async function upload(bytes, name, type) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  form.append("network", "public");
  form.append("name", name);
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.cid) throw new Error(`Pinata upload failed for ${name}: HTTP ${res.status}`);
  return `ipfs://${json.data.cid}`;
}

const out = [];
for (const item of ITEMS) {
  const image = await upload(await readFile(path.join(here, "art", item.file)), item.file, "image/svg+xml");
  const metadata = {
    name: item.name,
    description: `${item.description} Test NFT for the Plinths sealed-bid auction market on PortaldotV3 Testnet; no value.`,
    image,
    attributes: [...item.attributes, { trait_type: "Collection", value: "Plinths Test NFT" }],
  };
  const tokenURI = await upload(JSON.stringify(metadata, null, 2), item.file.replace(".svg", ".json"), "application/json");
  out.push({ name: item.name, image, tokenURI });
  console.log(`${item.name}\n  image:    ${image}\n  tokenURI: ${tokenURI}`);
}

await writeFile(path.join(here, "uris.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log("Wrote scripts/test-nft/uris.json");
