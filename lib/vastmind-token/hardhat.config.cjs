require("@nomicfoundation/hardhat-ethers");

const sepoliaConfigured = Boolean(
  process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY,
);

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: sepoliaConfigured
    ? {
        sepolia: {
          url: process.env.SEPOLIA_RPC_URL,
          chainId: 11155111,
          accounts: [process.env.DEPLOYER_PRIVATE_KEY],
        },
      }
    : {},
};
