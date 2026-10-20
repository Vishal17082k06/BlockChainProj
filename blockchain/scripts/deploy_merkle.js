const hre = require("hardhat");
const { deployContract } = require("./lib/deploy_contract");

deployContract(hre, "MerkleRegistry", "merkle_deployment").catch((e) => { console.error(e); process.exit(1); });
