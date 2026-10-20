const hre = require("hardhat");
const { collectAnchors } = require("./lib/anchors");

async function main() {
  const { ethers } = hre;
  const F = await ethers.getContractFactory("IntegrityRegistry");
  const registry = await F.deploy();   // fresh copy; does not touch the main deployment
  await registry.waitForDeployment();

  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  await registry.anchorHash("note", 1, h("note 1 v1"));
  await registry.anchorHash("note", 2, h("note 2 v1"));
  await registry.anchorHash("note", 1, h("note 1 v2"));
  await registry.markDeleted("note", 2);

  console.log(JSON.stringify(await collectAnchors(registry), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
