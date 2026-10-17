// Deploys the test-only PlinthsTestNFT collection and mints the three items from scripts/test-nft/uris.json.
//   npm run nft:portaldotv3          (NFT_RECIPIENT defaults to the deployer)
const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");

  const items = JSON.parse(fs.readFileSync(path.join(__dirname, "test-nft", "uris.json"), "utf8"));
  const recipient = process.env.NFT_RECIPIENT || deployer.address;

  const nft = await (await hre.ethers.getContractFactory("PlinthsTestNFT", deployer)).deploy(deployer.address);
  const receipt = await nft.deploymentTransaction().wait();
  console.log("PlinthsTestNFT:", await nft.getAddress());
  console.log("Deploy block:  ", receipt.blockNumber);
  console.log("Recipient:     ", recipient);

  for (const item of items) {
    const tx = await nft.mint(recipient, item.tokenURI);
    await tx.wait();
    const id = await nft.totalMinted();
    console.log(`Minted #${id} ${item.name} → ${item.tokenURI} (tx ${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
