const hre = require("hardhat");
const { ethers } = hre;

const h1 = ethers.keccak256(ethers.toUtf8Bytes("version one"));
const h2 = ethers.keccak256(ethers.toUtf8Bytes("version two"));

function recordKey(type, id) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256"], [type, id])
  );
}

// Send a transaction, wait for it to be mined, return the gas it used.
async function gasOf(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return receipt.gasUsed;
}

async function deployGas(name) {
  const F = await ethers.getContractFactory(name);
  const c = await F.deploy();
  const receipt = await c.deploymentTransaction().wait();
  return { contract: c, gas: receipt.gasUsed };
}

async function main() {
  const rows = [];

  const s = await deployGas("IntegrityRegistry");
  const b = await deployGas("IntegrityRegistryBytes32");
  rows.push(["deploy contract", s.gas, b.gas]);

  rows.push(["anchor, first version (type 'note')",
    await gasOf(s.contract.anchorHash("note", 1, h1)),
    await gasOf(b.contract.anchorHash(recordKey("note", 1), h1))]);

  rows.push(["anchor, second version (same record)",
    await gasOf(s.contract.anchorHash("note", 1, h2)),
    await gasOf(b.contract.anchorHash(recordKey("note", 1), h2))]);

  rows.push(["anchor, first version (long type 'calendarevent')",
    await gasOf(s.contract.anchorHash("calendarevent", 2, h1)),
    await gasOf(b.contract.anchorHash(recordKey("calendarevent", 2), h1))]);

  rows.push(["markDeleted",
    await gasOf(s.contract.markDeleted("note", 1)),
    await gasOf(b.contract.markDeleted(recordKey("note", 1)))]);

  console.log("| Operation | string design (gas) | bytes32 design (gas) | difference |");
  console.log("|---|---|---|---|");
  for (const [name, a, c] of rows) {
    console.log(`| ${name} | ${a} | ${c} | ${a - c} |`);
  }
  console.log("\nReads (verify, getLatest, versionCount) cost no gas when called off-chain.");
}

main().catch((e) => { console.error(e); process.exit(1); });
