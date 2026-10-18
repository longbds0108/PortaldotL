// Seeds the three demo tenders (CLAUDE.md §8). Metadata goes to IPFS via Pinata and only its 32-byte digest is
// stored on-chain (see IBlindBidMarket / web/lib/cid.ts).
//   PRIVATE_KEY=… BLINDBID_ADDRESS=… PINATA_JWT=… npx hardhat run scripts/seed.cjs --network <portaldotv3Testnet|localhost>
const hre = require("hardhat");

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** sha2-256 digest inside a base32 CIDv1 (raw or dag-pb) — same rule as web/lib/cid.ts. */
function cidDigest(cid) {
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of cid.slice(1)) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const bytes = Buffer.from(out);
  if (cid[0] !== "b" || bytes[0] !== 0x01 || bytes[2] !== 0x12 || bytes[3] !== 0x20) throw new Error(`Unexpected CID ${cid}`);
  return `0x${bytes.subarray(4, 36).toString("hex")}`;
}

async function uploadJson(value, name) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("Set PINATA_JWT (same server-only key as web/.env.local) so metadata can be pinned.");
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(value)], { type: "application/json" }), name);
  form.append("network", "public");
  const res = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.cid) throw new Error(`Pinata upload failed (${res.status})`);
  return cidDigest(json.data.cid);
}

const metadata = (title, category, description, eligibility) => ({
  version: 1,
  title,
  category,
  description,
  eligibility,
  criteria: "Price, technical approach and track record.",
});

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const address = process.env.BLINDBID_ADDRESS;
  if (!address) throw new Error("Set BLINDBID_ADDRESS to the deployed contract.");

  const market = await hre.ethers.getContractAt("BlindBidMarket", address, signer);
  const latest = await hre.ethers.provider.getBlock("latest");
  const now = BigInt(latest.timestamp);
  const day = 24n * 60n * 60n;
  // EVM native-value units: 18 decimals on PortaldotV3's EVM layer.
  const tpot = (amount) => hre.ethers.parseUnits(amount, 18);

  const tenders = [
    [metadata("Enterprise Website Development", "Technology", "Design and build a responsive corporate website with CMS, multilingual support and SEO setup.", "Portfolio of 3+ comparable projects; delivery within 8 weeks."), tpot("5000"), tpot("10000"), now + 2n * day, now + 3n * day, tpot("1")],
    [metadata("Commercial Building Renovation", "Construction", "Interior renovation of a 2-floor office (600 m2): partitions, electrical, HVAC and finishing.", "Licensed contractor; safety record; 12-month warranty."), tpot("80000"), tpot("120000"), now + 4n * day, now + 5n * day, tpot("2")],
    [metadata("Digital Marketing Campaign", "Services", "Three-month multi-channel campaign (social, search, email) for a product launch.", "Case studies with measurable results; monthly reporting."), tpot("3000"), tpot("6000"), now + day, now + 2n * day, 0n],
  ];

  for (const [meta, ...args] of tenders) {
    const digest = await uploadJson(meta, "tender.json");
    const tx = await market.createTender(digest, ...args);
    await tx.wait();
    console.log(`Created "${meta.title}" (metadata ${digest})`);
  }
  console.log("Seeded 3 demo tenders.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
