const fs = require("fs");
const path = require("path");

const SEPOLIA_CHAIN_ID = 11155111n;

// Deploys `contractName`, writes <filePrefix>[.network].json with address, deployment block and ABI.
// On a real network it is a DRY RUN unless CONFIRM_DEPLOY=yes, and it only ever targets Sepolia.
async function deployContract(hre, contractName, filePrefix) {
  const { ethers, network } = hre;
  const inProcess = network.name === "hardhat";
  const isLocal = inProcess || network.name === "localhost";
  const Factory = await ethers.getContractFactory(contractName);

  if (!isLocal) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error(`Refusing to deploy: chain id ${chainId} is not Sepolia (${SEPOLIA_CHAIN_ID}).`);
    }
    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);
    const deployTx = await Factory.getDeployTransaction();
    const gas = await ethers.provider.estimateGas({ ...deployTx, from: signer.address });
    const fee = await ethers.provider.getFeeData();
    const price = fee.maxFeePerGas ?? fee.gasPrice;
    console.log(`Contract:       ${contractName}`);
    console.log(`Network:        ${network.name} (chain id ${chainId})`);
    console.log(`Deployer:       ${signer.address}`);
    console.log(`Balance:        ${ethers.formatEther(balance)} ETH`);
    console.log(`Estimated gas:  ${gas}`);
    console.log(`Estimated cost: ${ethers.formatEther(gas * price)} ETH (at max fee ${ethers.formatUnits(price, "gwei")} gwei)`);
    if (process.env.CONFIRM_DEPLOY !== "yes") {
      console.log("Dry run only. Nothing was sent. Re-run with CONFIRM_DEPLOY=yes to deploy.");
      return;
    }
  }

  const contract = await Factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  console.log(`${contractName} deployed to ${address} (block ${receipt.blockNumber})`);

  if (inProcess) {
    console.log("In-process network: its addresses exist only for this run, so no file was written.");
    return;
  }
  const artifact = await hre.artifacts.readArtifact(contractName);
  const suffix = network.name === "localhost" ? "" : `.${network.name}`;
  const out = path.join(__dirname, "..", "..", `${filePrefix}${suffix}.json`);
  fs.writeFileSync(out, JSON.stringify(
    { address, deploymentBlock: receipt.blockNumber, abi: artifact.abi }, null, 2));
  console.log("Wrote", out);
}

module.exports = { deployContract };
