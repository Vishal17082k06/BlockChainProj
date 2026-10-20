const hre = require("hardhat");
const { ethers } = hre;

const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

async function gasOf(txPromise) {
  const tx = await txPromise;
  return (await tx.wait()).gasUsed;
}

async function fresh(name) {
  const c = await (await ethers.getContractFactory(name)).deploy();
  await c.waitForDeployment();
  return c;
}

async function main() {
  console.log("| Records (N) | one tx per record: total gas | one Merkle root: gas | per record: single | per record: Merkle | saving | proof size |");
  console.log("|---|---|---|---|---|---|---|");
  for (const n of [1, 10, 100]) {
    const single = await fresh("IntegrityRegistry");   // fresh contract: every record is a first anchor
    const merkle = await fresh("MerkleRegistry");      // fresh contract: first batch
    let total = 0n;
    for (let i = 0; i < n; i++) {
      total += await gasOf(single.anchorHash("note", i + 1, h(`record ${n}-${i}`)));
    }
    const root = await gasOf(merkle.anchorRoot(h(`root of ${n} records`), n));
    const perSingle = total / BigInt(n);
    const perMerkle = root / BigInt(n);
    const saving = (100n * (total - root)) / total;
    const proofHashes = Math.ceil(Math.log2(n));
    console.log(`| ${n} | ${total} | ${root} | ${perSingle} | ${perMerkle} | ${saving}% | ${proofHashes} hashes (${proofHashes * 32} bytes) |`);
  }

  console.log("\nOne Merkle root costs the same gas whatever N is, so only its single-transaction cost is shown below.");
  console.log("(The matching 'one tx per record' totals for these sizes were not measured.)");
  console.log("| Records (N) | one Merkle root: gas | per record |");
  console.log("|---|---|---|");
  for (const n of [1000, 10000]) {
    const merkle = await fresh("MerkleRegistry");
    const root = await gasOf(merkle.anchorRoot(h(`root of ${n} records`), n));
    console.log(`| ${n} | ${root} | ${root / BigInt(n)} |`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
