// Deploys the test-only PlinthsTestNFT collection. Its constructor mints the three items (metadata in
// scripts/test-nft/uris.json, hard-coded in the contract) to the deployer; there is no mint function.
//   npm run nft:portaldotv3
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const nft = await (await hre.ethers.getContractFactory("PlinthsTestNFT", deployer)).deploy();
  const receipt = await nft.deploymentTransaction().wait();
  console.log("PlinthsTestNFT:", await nft.getAddress());
  console.log("Deploy block:  ", receipt.blockNumber);
  console.log("Owner of #1–#3:", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
