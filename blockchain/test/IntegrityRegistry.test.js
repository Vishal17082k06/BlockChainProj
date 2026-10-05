const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("IntegrityRegistry", function () {
  let registry, owner, other;
  const h1 = ethers.keccak256(ethers.toUtf8Bytes("version one"));
  const h2 = ethers.keccak256(ethers.toUtf8Bytes("version two"));
  const ZERO = ethers.ZeroHash;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("IntegrityRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  describe("anchoring and verifying", () => {
    it("anchors a hash and verifies it", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.verify("note", 1, h1)).to.equal(true);
    });

    it("rejects a different hash", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.verify("note", 1, h2)).to.equal(false);
    });

    it("returns false for a record that was never anchored", async () => {
      expect(await registry.verify("note", 99, h1)).to.equal(false);
    });

    it("keeps different record types and ids separate", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("conversation", 1, h2);
      expect(await registry.verify("note", 1, h1)).to.equal(true);
      expect(await registry.verify("conversation", 1, h2)).to.equal(true);
      expect(await registry.verify("note", 1, h2)).to.equal(false);
      expect(await registry.verify("note", 2, h1)).to.equal(false);
    });

    it("anchorHash returns the new version number", async () => {
      expect(await registry.anchorHash.staticCall("note", 1, h1)).to.equal(1n);
    });
  });

  describe("versioning", () => {
    it("keeps history when a record is re-anchored", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      expect(await registry.versionCount("note", 1)).to.equal(2n);
      expect(await registry.verify("note", 1, h2)).to.equal(true);
      expect(await registry.verify("note", 1, h1)).to.equal(false); // old version is no longer valid
    });

    it("getVersion returns each historic hash", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      const [first] = await registry.getVersion("note", 1, 0);
      const [second] = await registry.getVersion("note", 1, 1);
      expect(first).to.equal(h1);
      expect(second).to.equal(h2);
    });

    it("getLatest returns zeros for an unknown record", async () => {
      const [hash, version, timestamp, isDeleted] = await registry.getLatest("note", 42);
      expect(hash).to.equal(ZERO);
      expect(version).to.equal(0n);
      expect(timestamp).to.equal(0n);
      expect(isDeleted).to.equal(false);
    });

    it("getLatest returns the newest hash and version", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      const [hash, version, timestamp, isDeleted] = await registry.getLatest("note", 1);
      expect(hash).to.equal(h2);
      expect(version).to.equal(2n);
      expect(timestamp).to.be.greaterThan(0n);
      expect(isDeleted).to.equal(false);
    });
  });

  describe("events", () => {
    it("emits HashAnchored with the record details", async () => {
      await expect(registry.anchorHash("note", 7, h1))
        .to.emit(registry, "HashAnchored")
        .withArgs("note", 7, 1, h1, anyValue);
    });

    it("emits RecordMarkedDeleted", async () => {
      await registry.anchorHash("note", 7, h1);
      await expect(registry.markDeleted("note", 7))
        .to.emit(registry, "RecordMarkedDeleted")
        .withArgs("note", 7, anyValue);
    });
  });

  describe("deletion", () => {
    it("blocks anchoring after deletion is marked", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.markDeleted("note", 1);
      await expect(registry.anchorHash("note", 1, h2)).to.be.revertedWith("Record marked deleted");
    });

    it("reports a deleted record as not verified and flags it in getLatest", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.markDeleted("note", 1);
      expect(await registry.verify("note", 1, h1)).to.equal(false);
      const [, , , isDeleted] = await registry.getLatest("note", 1);
      expect(isDeleted).to.equal(true);
    });

    it("refuses to mark a record deleted if nothing was anchored", async () => {
      await expect(registry.markDeleted("note", 5)).to.be.revertedWith("Nothing anchored");
    });
  });

  describe("access control", () => {
    it("rejects anchorHash from a non-owner", async () => {
      await expect(registry.connect(other).anchorHash("note", 1, h1))
        .to.be.revertedWith("Not authorized");
    });

    it("rejects markDeleted from a non-owner", async () => {
      await registry.anchorHash("note", 1, h1);
      await expect(registry.connect(other).markDeleted("note", 1))
        .to.be.revertedWith("Not authorized");
    });

    it("lets anyone read", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.connect(other).verify("note", 1, h1)).to.equal(true);
    });
  });
});
