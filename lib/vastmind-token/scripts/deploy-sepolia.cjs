const { ethers, network } = require("hardhat");

async function main() {
  if (network.name !== "sepolia") {
    throw new Error("Refusing to deploy: this script is Sepolia testnet only.");
  }
  if (!process.env.SEPOLIA_RPC_URL || !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY using workspace Secrets.",
    );
  }

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 11155111n) {
    throw new Error(`Refusing to deploy on unexpected chain ${chain.chainId}.`);
  }

  const factory = await ethers.getContractFactory("VastMindCoinTestnet");
  const token = await factory.deploy();
  await token.waitForDeployment();

  console.log(
    JSON.stringify(
      {
        network: "sepolia",
        chainId: Number(chain.chainId),
        tokenName: await token.name(),
        tokenSymbol: await token.symbol(),
        contractAddress: await token.getAddress(),
        deployer: (await ethers.getSigners())[0].address,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
