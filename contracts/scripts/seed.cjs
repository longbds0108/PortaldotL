const hre = require("hardhat");

function metadata(title, category, description, eligibility) {
  const json = {
    version: 1,
    title,
    category,
    description,
    eligibility,
    criteria: "Price, technical approach and track record.",
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const address = process.env.BLINDBID_ADDRESS;
  if (!address) throw new Error("Set BLINDBID_ADDRESS to the deployed PortaldotV3 contract.");

  const market = await hre.ethers.getContractAt("BlindBidMarket", address, signer);
  const latest = await hre.ethers.provider.getBlock("latest");
  const now = BigInt(latest.timestamp);
  const day = 24n * 60n * 60n;
  const tpot = (amount) => hre.ethers.parseUnits(amount, 14);

  const tenders = [
    [metadata("Enterprise Website Development", "Technology", "Design and build a responsive corporate website with CMS, multilingual support and SEO setup.", "Portfolio of 3+ comparable projects; delivery within 8 weeks."), tpot("5000"), tpot("10000"), now + 2n * day, now + 3n * day, tpot("1")],
    [metadata("Commercial Building Renovation", "Construction", "Interior renovation of a 2-floor office (600 m2): partitions, electrical, HVAC and finishing.", "Licensed contractor; safety record; 12-month warranty."), tpot("80000"), tpot("120000"), now + 4n * day, now + 5n * day, tpot("5")],
    [metadata("Digital Marketing Campaign", "Services", "Three-month multi-channel campaign (social, search, email) for a product launch.", "Case studies with measurable results; monthly reporting."), tpot("3000"), tpot("6000"), now + day, now + 2n * day, 0n],
  ];

  for (const args of tenders) {
    const tx = await market.createTender(...args);
    await tx.wait();
  }
  console.log("Seeded 3 demo tenders on PortaldotV3 Testnet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
