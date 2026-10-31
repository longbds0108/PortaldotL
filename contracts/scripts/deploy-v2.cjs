const hre = require("hardhat");

// Deploys BlindBidMarketV2 and SealedNFTAuctionV2. Spends tPOTv3 (about 277 + 285 at the gas price measured on
// 2026-10-31), so it refuses to run without an explicit confirmation. See docs/SECURITY_CHANGES.md first.
async function main() {
  if (process.env.CONFIRM_V2_DEPLOY !== "yes") {
    throw new Error("Set CONFIRM_V2_DEPLOY=yes to deploy. Read docs/SECURITY_CHANGES.md first.");
  }
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  for (const [name, env] of [
    ["BlindBidMarketV2", "NEXT_PUBLIC_BLINDBID"],
    ["SealedNFTAuctionV2", "NEXT_PUBLIC_NFT_AUCTION"],
  ]) {
    const contract = await (await hre.ethers.getContractFactory(name, deployer)).deploy(treasury);
    const receipt = await contract.deploymentTransaction().wait();
    console.log(`${name}: ${await contract.getAddress()} (tx ${receipt.hash})`);
    console.log(`${env}_ADDRESS=${await contract.getAddress()}`);
    console.log(`${env}_DEPLOY_BLOCK=${receipt.blockNumber}`);
    console.log(`${env}_VERSION=2\n`);
  }
  console.log("Treasury:", treasury);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
