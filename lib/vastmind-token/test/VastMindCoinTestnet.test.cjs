const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("VastMindCoinTestnet", function () {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VastMindCoinTestnet");
    const token = await factory.deploy();
    await token.waitForDeployment();
    return { token, owner, alice, bob };
  }

  it("mints the documented test supply to the deployer", async function () {
    const { token, owner } = await deploy();
    assert.equal(await token.name(), "VastMind Coin");
    assert.equal(await token.symbol(), "VMC");
    assert.equal(await token.balanceOf(owner.address), ethers.parseEther("1000000"));
  });

  it("lets a wallet claim test tokens once per cooldown", async function () {
    const { token, alice } = await deploy();
    await token.connect(alice).claimTestTokens();
    assert.equal(await token.balanceOf(alice.address), ethers.parseEther("100"));

    await assert.rejects(
      token.connect(alice).claimTestTokens(),
      /Claim cooldown active/,
    );

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await token.connect(alice).claimTestTokens();
    assert.equal(await token.balanceOf(alice.address), ethers.parseEther("200"));
  });

  it("supports ordinary ERC-20 transfers between test wallets", async function () {
    const { token, alice, bob } = await deploy();
    await token.connect(alice).claimTestTokens();
    await token.connect(alice).transfer(bob.address, ethers.parseEther("25"));

    assert.equal(await token.balanceOf(alice.address), ethers.parseEther("75"));
    assert.equal(await token.balanceOf(bob.address), ethers.parseEther("25"));
  });
});
