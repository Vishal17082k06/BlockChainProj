require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
// Same file the Python code reads. This config file itself contains no secrets.
require("dotenv").config({ path: path.join(__dirname, "..", "python", ".env"), quiet: true });

const { SEPOLIA_RPC_URL } = process.env;
// MetaMask shows a private key without the 0x prefix; Hardhat needs it, so add it if missing.
const rawKey = (process.env.SEPOLIA_PRIVATE_KEY || "").trim();
const SEPOLIA_PRIVATE_KEY = rawKey && !rawKey.toLowerCase().startsWith("0x") ? `0x${rawKey}` : rawKey;

const networks = {
  // `npx hardhat node` listens here; scripts use `--network localhost`.
  localhost: { url: "http://127.0.0.1:8545" },
};
// Only defined when both variables exist, so local work never needs them.
if (SEPOLIA_RPC_URL && SEPOLIA_PRIVATE_KEY) {
  networks.sepolia = { url: SEPOLIA_RPC_URL, accounts: [SEPOLIA_PRIVATE_KEY], chainId: 11155111 };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Compiler version. Must satisfy the contracts' `pragma solidity ^0.8.20;`.
  solidity: "0.8.24",
  networks,
};
