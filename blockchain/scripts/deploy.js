const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("IntegrityRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  // The ABI is the list of functions Python needs to call the contract.
  const artifact = await hre.artifacts.readArtifact("IntegrityRegistry");
  const out = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(out, JSON.stringify({ address, abi: artifact.abi }, null, 2));
  console.log("IntegrityRegistry deployed to", address);
  console.log("Wrote", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
