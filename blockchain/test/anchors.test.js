const { expect } = require("chai");
const { ethers } = require("hardhat");
const { collectAnchors } = require("../scripts/lib/anchors");

describe("collectAnchors (rebuild records from event logs)", function () {
  let registry;
  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  beforeEach(async () => {
    const F = await ethers.getContractFactory("IntegrityRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("returns an empty list for a fresh contract", async () => {
    expect(await collectAnchors(registry)).to.deep.equal([]);
  });

  it("rebuilds versions, order and deletion from events only", async () => {
    await registry.anchorHash("note", 1, h("a"));
    await registry.anchorHash("conversation", 5, h("b"));
    await registry.anchorHash("note", 1, h("c"));   // note 1 gets version 2
    await registry.markDeleted("conversation", 5);

    const records = await collectAnchors(registry);
    expect(records.length).to.equal(2);

    const note = records[0];
    expect(note.recordType).to.equal("note");
    expect(note.recordId).to.equal(1);
    expect(note.deleted).to.equal(false);
    expect(note.versions.map((v) => v.version)).to.deep.equal([1, 2]);
    expect(note.versions.map((v) => v.hash)).to.deep.equal([h("a"), h("c")]);
    expect(note.versions[0].blockNumber).to.be.lessThan(note.versions[1].blockNumber);

    const conv = records[1];
    expect(conv.recordType).to.equal("conversation");
    expect(conv.recordId).to.equal(5);
    expect(conv.deleted).to.equal(true);
  });

  it("agrees with the contract's own latest state", async () => {
    await registry.anchorHash("note", 3, h("x"));
    await registry.anchorHash("note", 3, h("y"));
    const [rec] = await collectAnchors(registry);
    const latest = rec.versions[rec.versions.length - 1];
    const [hash, version] = await registry.getLatest("note", 3);
    expect(latest.hash).to.equal(hash);
    expect(BigInt(latest.version)).to.equal(version);
  });
});
