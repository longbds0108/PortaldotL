require("@nomicfoundation/hardhat-ethers");

const privateKey = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    portaldotv3Testnet: {
      url: process.env.PORTALDOTV3_TESTNET_RPC_URL || "https://testnetv3-eth-rpc.feso-apps.xyz",
      chainId: 420420777,
      accounts: privateKey ? [privateKey] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 420420777,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  paths: {
    sources: "./src",
    artifacts: "./hh-artifacts",
    cache: "./hh-cache",
  },
};
