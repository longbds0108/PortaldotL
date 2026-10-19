// Deploys DisputeRegistry. The arbiter (who reviews and closes disputes) is fixed at deployment:
// ARBITER_ADDRESS, or the deployer when unset.
//   npm run deploy:disputes:portaldotv3
// Then set in web/.env.local (and Vercel): NEXT_PUBLIC_DISPUTES_ADDRESS, NEXT_PUBLIC_DISPUTES_DEPLOY_BLOCK.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const arbiter = process.env.ARBITER_ADDRESS || deployer.address;
  const registry = await (await hre.ethers.getContractFactory("DisputeRegistry", deployer)).deploy(arbiter);
  const receipt = await registry.deploymentTransaction().wait();
  console.log("DisputeRegistry:", await registry.getAddress(), "block", receipt.blockNumber, "tx", receipt.hash);
  console.log("Arbiter:        ", arbiter);
  console.log("\nweb/.env.local:");
  console.log(`NEXT_PUBLIC_DISPUTES_ADDRESS=${await registry.getAddress()}`);
  console.log(`NEXT_PUBLIC_DISPUTES_DEPLOY_BLOCK=${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
