# Step 08: Run a local blockchain and deploy

Date: 2026-10-05
Phase / Task: Phase 3, Task 3.3

## Goal
Start a local blockchain, deploy `IntegrityRegistry` to it, and prove an
outside program (Python) can talk to the deployed contract.

## Why this step exists
Tests deploy a fresh throwaway copy of the contract each time. Our real module
needs ONE long-lived deployed contract with a known address, and the Python code
needs to know that address and the contract's ABI. `deploy.js` creates both
and saves them in `blockchain/deployment.json`.

## What we did
```
# terminal 1 (left running in the background)
npx hardhat node

# terminal 2
npx hardhat run scripts/deploy.js --network localhost
```
Wrote `blockchain/scripts/deploy.js`: it deploys the contract, waits until the
deployment is confirmed, reads the compiled ABI, and writes
`{ address, abi }` to `deployment.json`. That file is generated per machine and
is listed in `.gitignore`.

Blast radius: a local-only server on `127.0.0.1:8545` (your own computer, not
reachable from the internet). The 20 accounts Hardhat prints, with their
private keys, are publicly known test keys that every Hardhat user has. They hold
fake ETH, and Hardhat itself warns that anything sent to them on a real network
is lost. We never use them anywhere but here.

## Output / evidence
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
Account #0: 0xf39Fd6e5...2266 (10000 ETH)

IntegrityRegistry deployed to 0x5FbDB2315678afecb367f032d93F642f64180aa3

connected: True
chain id: 31337 | block number: 1
owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
first node account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
versionCount note/1: 0
```

## What this showed
1. **Python v8 `web3` can read our contract.** `owner()` and `versionCount()`
   worked, so the ABI and the web3 version are compatible for read calls.
   Sending transactions from Python (`anchor`) is tested in Task 5.2.
2. **The deployer is the owner.** The owner equals the first node account,
   exactly as the constructor (`owner = msg.sender`) promises.
3. **Block number 1** is the deployment itself: deploying a contract is a
   transaction, so it was recorded in a block. A fresh chain starts at block 0.
4. **The address is predictable.** `0x5FbDB...aa3` is the same for everyone who
   deploys first from account #0 on a fresh Hardhat node. An address derives from
   the deployer and its transaction count (nonce), not from randomness.

## Concepts met in this step
Local node, account, private key, transaction, block, chain id, contract
address, ABI, `deployment.json`. (See `docs/concepts.md`.)

## Things to remember
- **The node keeps everything in memory.** Stopping it erases the contract and
  all anchored hashes. After a restart: start the node, redeploy, and re-anchor.
  (This is known issue 4 in the master plan; Task 5.2 adds test snapshots.)
- The node is running in the background now. We need it for Phase 4.
- A local chain has one operator (you), so it demonstrates the mechanism, not
  the independence of a real network (Step 03, stage 4).

## Simple vs "proper" choice
- Simple: always use `localhost`, so the address never changes.
- Proper: a script that takes the network as an option and writes the address
  and ABI for whichever network it deployed to.
- Chosen: the second, via Hardhat's `--network` flag. The same script will
  deploy to Sepolia in Phase 7 with no code change, only a config entry.

## What I should be able to explain after this
(Write this yourself: what is the ABI, and why does Python need both the ABI
and the address to call the contract? Why do the Hardhat test accounts have
public private keys?)
