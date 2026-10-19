// Deploys the NFT auction market (SealedNFTAuction) and, unless TEST_NFT_ADDRESS is set, the test-only
// PlinthsTestNFT collection whose constructor gives items #1–#3 to the deployer (there is no mint function).
//   npm run deploy:nft:portaldotv3
// Then set in web/.env.local (and Vercel): NEXT_PUBLIC_NFT_AUCTION_ADDRESS, NEXT_PUBLIC_NFT_AUCTION_DEPLOY_BLOCK,
// NEXT_PUBLIC_TEST_NFT_ADDRESS.
const hre = require("hardhat");

async function deploy(name, args, deployer) {
  const contract = await (await hre.ethers.getContractFactory(name, deployer)).deploy(...args);
  const receipt = await contract.deploymentTransaction().wait();
  return { address: await contract.getAddress(), block: receipt.blockNumber, hash: receipt.hash };
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY to a funded PortaldotV3 EVM account.");
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  const auction = await deploy("SealedNFTAuction", [treasury], deployer);
  console.log("SealedNFTAuction:", auction.address, "block", auction.block, "tx", auction.hash);

  let nft = process.env.TEST_NFT_ADDRESS;
  if (!nft) {
    const d = await deploy("PlinthsTestNFT", [], deployer);
    nft = d.address;
    console.log("PlinthsTestNFT:  ", d.address, "block", d.block, "tx", d.hash, "· items #1–#3 owned by", deployer.address);
  }

  console.log("\nweb/.env.local:");
  console.log(`NEXT_PUBLIC_NFT_AUCTION_ADDRESS=${auction.address}`);
  console.log(`NEXT_PUBLIC_NFT_AUCTION_DEPLOY_BLOCK=${auction.block}`);
  console.log(`NEXT_PUBLIC_TEST_NFT_ADDRESS=${nft}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
