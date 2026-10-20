const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Same rules as python/merkle.py
const leafHash = (leaf) => ethers.keccak256(ethers.concat(["0x00", leaf]));
const pairHash = (a, b) => {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat(["0x01", lo, hi]));
};

describe("MerkleRegistry", function () {
  let registry, other;
  const leaf = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const l0 = leaf("record 0"), l1 = leaf("record 1"), l2 = leaf("record 2");

  // Hand-built 3-leaf tree: level 0 = [h0, h1, h2]; level 1 = [pair(h0,h1), h2 promoted]
  const h0 = leafHash(l0), h1 = leafHash(l1), h2 = leafHash(l2);
  const n01 = pairHash(h0, h1);
  const root = pairHash(n01, h2);
  const proofs = { 0: [h1, h2], 1: [h0, h2], 2: [n01] };

  beforeEach(async () => {
    [, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MerkleRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("anchors a root and returns it with count and timestamp", async () => {
    await registry.anchorRoot(root, 3);
    const [r, count, ts] = await registry.getBatch(0);
    expect(r).to.equal(root);
    expect(count).to.equal(3n);
    expect(ts).to.be.greaterThan(0n);
  });

  it("numbers batches sequentially", async () => {
    expect(await registry.anchorRoot.staticCall(root, 3)).to.equal(0n);
    await registry.anchorRoot(root, 3);
    expect(await registry.anchorRoot.staticCall(leaf("other"), 1)).to.equal(1n);
    await registry.anchorRoot(leaf("other"), 1);
    expect(await registry.batchCount()).to.equal(2n);
  });

  it("emits RootAnchored", async () => {
    await expect(registry.anchorRoot(root, 3))
      .to.emit(registry, "RootAnchored")
      .withArgs(0, root, 3, anyValue);
  });

  it("rejects non-owner and empty batches", async () => {
    await expect(registry.connect(other).anchorRoot(root, 3)).to.be.revertedWith("Not authorized");
    await expect(registry.anchorRoot(root, 0)).to.be.revertedWith("Empty batch");
  });

  it("getBatch reverts for an unknown batch", async () => {
    await expect(registry.getBatch(0)).to.be.revertedWith("Unknown batch");
  });

  it("verifies a valid proof for every leaf of the 3-leaf tree", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, l0, proofs[0])).to.equal(true);
    expect(await registry.verify(0, l1, proofs[1])).to.equal(true);
    expect(await registry.verify(0, l2, proofs[2])).to.equal(true);
  });

  it("rejects a leaf that is not in the batch", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, leaf("forged"), proofs[0])).to.equal(false);
  });

  it("rejects a tampered proof", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, l0, [h1, leaf("tampered")])).to.equal(false);
  });

  it("rejects a proof checked against the wrong batch", async () => {
    await registry.anchorRoot(root, 3);
    await registry.anchorRoot(leaf("unrelated root"), 3);
    expect(await registry.verify(1, l0, proofs[0])).to.equal(false);
  });

  it("verify reverts for an unknown batch", async () => {
    await expect(registry.verify(5, l0, proofs[0])).to.be.revertedWith("Unknown batch");
  });
});
