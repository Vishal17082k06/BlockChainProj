require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Compiler version. Must satisfy the contract's `pragma solidity ^0.8.20;`.
  solidity: "0.8.24",
  networks: {
    // `npx hardhat node` listens here; scripts use `--network localhost`.
    localhost: { url: "http://127.0.0.1:8545" },
  },
};
