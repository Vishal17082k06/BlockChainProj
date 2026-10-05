const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("MerkleRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  const artifact = await hre.artifacts.readArtifact("MerkleRegistry");
  const out = path.join(__dirname, "..", "merkle_deployment.json");
  fs.writeFileSync(out, JSON.stringify({ address, abi: artifact.abi }, null, 2));
  console.log("MerkleRegistry deployed to", address);
  console.log("Wrote", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
