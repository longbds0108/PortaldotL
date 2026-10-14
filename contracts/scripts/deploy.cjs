const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const factory = await hre.ethers.getContractFactory("BlindBidMarket", deployer);
  const market = await factory.deploy(treasury);
  const tx = market.deploymentTransaction();
  const receipt = await tx.wait();

  console.log("BlindBidMarket:", await market.getAddress());
  console.log("Treasury:      ", treasury);
  console.log("Deployer:      ", deployer.address);
  console.log("Deploy block:  ", receipt.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
