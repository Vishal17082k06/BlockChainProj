const { expect } = require("chai");
const { ethers } = require("hardhat");

function recordKey(type, id) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256"], [type, id])
  );
}

describe("IntegrityRegistryBytes32", function () {
  let registry, other;
  const h1 = ethers.keccak256(ethers.toUtf8Bytes("version one"));
  const h2 = ethers.keccak256(ethers.toUtf8Bytes("version two"));
  const key = recordKey("note", 1);

  beforeEach(async () => {
    [, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("IntegrityRegistryBytes32");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("anchors a hash and verifies it", async () => {
    await registry.anchorHash(key, h1);
    expect(await registry.verify(key, h1)).to.equal(true);
    expect(await registry.verify(key, h2)).to.equal(false);
  });

  it("only the latest version is valid", async () => {
    await registry.anchorHash(key, h1);
    await registry.anchorHash(key, h2);
    expect(await registry.versionCount(key)).to.equal(2n);
    expect(await registry.verify(key, h2)).to.equal(true);
    expect(await registry.verify(key, h1)).to.equal(false);
  });

  it("blocks anchoring after deletion and fails verification", async () => {
    await registry.anchorHash(key, h1);
    await registry.markDeleted(key);
    expect(await registry.verify(key, h1)).to.equal(false);
    await expect(registry.anchorHash(key, h2)).to.be.revertedWith("Record marked deleted");
  });

  it("rejects non-owner writes and unanchored deletes", async () => {
    await expect(registry.connect(other).anchorHash(key, h1)).to.be.revertedWith("Not authorized");
    await expect(registry.markDeleted(key)).to.be.revertedWith("Nothing anchored");
  });
});
