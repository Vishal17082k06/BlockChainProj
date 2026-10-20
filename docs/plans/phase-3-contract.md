# Phase 3: IntegrityRegistry Smart Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested Solidity contract that stores an append-only list of 32-byte hashes per record, supports authorised deletion marking, and is deployed on a local Hardhat chain.

**Architecture:** One contract. Each record is identified by `keccak256(abi.encode(recordType, recordId))`. That key maps to an array of `Version {hash, timestamp}` (append-only), plus a `deleted` flag. Only the deploying account (`owner`) can write; anyone can read.

**Tech Stack:** Solidity 0.8.24, Hardhat 2.29, ethers v6 (via hardhat-toolbox hh2), chai matchers.

**Spec:** `Blockchain_Data_Integrity_Verification_Report.pdf` sections 7.4, 8.4, 8.5, 8.6. Master plan: `docs/00-master-plan.md`, Phase 3.

## Global Constraints

- Contract design must match PDF 7.4: `anchorHash`, `markDeleted`, `getLatest`, `verify`, `versionCount`, `getVersion`, events `HashAnchored` and `RecordMarkedDeleted`.
- Only the latest version is valid (`verify` compares against the last entry).
- `anchorHash` reverts with `"Record marked deleted"` after deletion; non-owner calls revert with `"Not authorized"`; `markDeleted` with nothing anchored reverts with `"Nothing anchored"`.
- No personal data on-chain: only type, id, hash, version, timestamp.
- Hardhat 2, CommonJS style, Solidity `^0.8.20`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `blockchain/test/IntegrityRegistry.test.js` | All contract behaviour, specified as tests (written first) |
| `blockchain/contracts/IntegrityRegistry.sol` | The contract |
| `blockchain/scripts/deploy.js` | Deploys to a chosen network, writes `deployment.json` (address + ABI) |
| `docs/journal/06-contract-tests.md`, `07-contract.md`, `08-deploy.md` | One journal entry per task |

---

### Task 3.1: Write the contract tests first (they must fail)

**Files:**
- Create: `blockchain/test/IntegrityRegistry.test.js`

**Interfaces:**
- Produces: the behaviour specification the contract in Task 3.2 must satisfy.

- [ ] **Step 1: Write the test file**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("IntegrityRegistry", function () {
  let registry, owner, other;
  const h1 = ethers.keccak256(ethers.toUtf8Bytes("version one"));
  const h2 = ethers.keccak256(ethers.toUtf8Bytes("version two"));
  const ZERO = ethers.ZeroHash;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("IntegrityRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  describe("anchoring and verifying", () => {
    it("anchors a hash and verifies it", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.verify("note", 1, h1)).to.equal(true);
    });

    it("rejects a different hash", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.verify("note", 1, h2)).to.equal(false);
    });

    it("returns false for a record that was never anchored", async () => {
      expect(await registry.verify("note", 99, h1)).to.equal(false);
    });

    it("keeps different record types and ids separate", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("conversation", 1, h2);
      expect(await registry.verify("note", 1, h1)).to.equal(true);
      expect(await registry.verify("conversation", 1, h2)).to.equal(true);
      expect(await registry.verify("note", 1, h2)).to.equal(false);
      expect(await registry.verify("note", 2, h1)).to.equal(false);
    });

    it("anchorHash returns the new version number", async () => {
      expect(await registry.anchorHash.staticCall("note", 1, h1)).to.equal(1n);
    });
  });

  describe("versioning", () => {
    it("keeps history when a record is re-anchored", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      expect(await registry.versionCount("note", 1)).to.equal(2n);
      expect(await registry.verify("note", 1, h2)).to.equal(true);
      expect(await registry.verify("note", 1, h1)).to.equal(false); // old version is no longer valid
    });

    it("getVersion returns each historic hash", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      const [first] = await registry.getVersion("note", 1, 0);
      const [second] = await registry.getVersion("note", 1, 1);
      expect(first).to.equal(h1);
      expect(second).to.equal(h2);
    });

    it("getLatest returns zeros for an unknown record", async () => {
      const [hash, version, timestamp, isDeleted] = await registry.getLatest("note", 42);
      expect(hash).to.equal(ZERO);
      expect(version).to.equal(0n);
      expect(timestamp).to.equal(0n);
      expect(isDeleted).to.equal(false);
    });

    it("getLatest returns the newest hash and version", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.anchorHash("note", 1, h2);
      const [hash, version, timestamp, isDeleted] = await registry.getLatest("note", 1);
      expect(hash).to.equal(h2);
      expect(version).to.equal(2n);
      expect(timestamp).to.be.greaterThan(0n);
      expect(isDeleted).to.equal(false);
    });
  });

  describe("events", () => {
    it("emits HashAnchored with the record details", async () => {
      await expect(registry.anchorHash("note", 7, h1))
        .to.emit(registry, "HashAnchored")
        .withArgs("note", 7, 1, h1, anyValue);
    });

    it("emits RecordMarkedDeleted", async () => {
      await registry.anchorHash("note", 7, h1);
      await expect(registry.markDeleted("note", 7))
        .to.emit(registry, "RecordMarkedDeleted")
        .withArgs("note", 7, anyValue);
    });
  });

  describe("deletion", () => {
    it("blocks anchoring after deletion is marked", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.markDeleted("note", 1);
      await expect(registry.anchorHash("note", 1, h2)).to.be.revertedWith("Record marked deleted");
    });

    it("reports a deleted record as not verified and flags it in getLatest", async () => {
      await registry.anchorHash("note", 1, h1);
      await registry.markDeleted("note", 1);
      expect(await registry.verify("note", 1, h1)).to.equal(false);
      const [, , , isDeleted] = await registry.getLatest("note", 1);
      expect(isDeleted).to.equal(true);
    });

    it("refuses to mark a record deleted if nothing was anchored", async () => {
      await expect(registry.markDeleted("note", 5)).to.be.revertedWith("Nothing anchored");
    });
  });

  describe("access control", () => {
    it("rejects anchorHash from a non-owner", async () => {
      await expect(registry.connect(other).anchorHash("note", 1, h1))
        .to.be.revertedWith("Not authorized");
    });

    it("rejects markDeleted from a non-owner", async () => {
      await registry.anchorHash("note", 1, h1);
      await expect(registry.connect(other).markDeleted("note", 1))
        .to.be.revertedWith("Not authorized");
    });

    it("lets anyone read", async () => {
      await registry.anchorHash("note", 1, h1);
      expect(await registry.connect(other).verify("note", 1, h1)).to.equal(true);
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run (from `blockchain/`): `npx hardhat test`
Expected: FAIL. Hardhat cannot find a contract named `IntegrityRegistry` (an error like `HH700: Artifact for contract "IntegrityRegistry" not found`). That is the correct failure: the tests exist, the contract does not.

- [ ] **Step 3: Write journal entry `docs/journal/06-contract-tests.md`** with the failing output pasted in.

- [ ] **Step 4: Commit**

```bash
git add blockchain/test docs/journal/06-contract-tests.md
git commit -m "test: specify IntegrityRegistry behaviour (failing)"
```

---

### Task 3.2: Implement the contract (make the tests pass)

**Files:**
- Create: `blockchain/contracts/IntegrityRegistry.sol`

**Interfaces:**
- Consumes: the tests from Task 3.1.
- Produces: contract `IntegrityRegistry` with
  - `owner() -> address`
  - `anchorHash(string recordType, uint256 recordId, bytes32 hash) -> uint256 version` (owner only)
  - `markDeleted(string recordType, uint256 recordId)` (owner only)
  - `getLatest(string, uint256) -> (bytes32 hash, uint256 version, uint256 timestamp, bool isDeleted)`
  - `verify(string, uint256, bytes32) -> bool`
  - `versionCount(string, uint256) -> uint256`
  - `getVersion(string, uint256, uint256 index) -> (bytes32 hash, uint256 timestamp)`
  - events `HashAnchored(string recordType, uint256 recordId, uint256 version, bytes32 hash, uint256 timestamp)` and `RecordMarkedDeleted(string recordType, uint256 recordId, uint256 timestamp)`

- [ ] **Step 1: Write the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IntegrityRegistry {
    address public owner;

    struct Version {
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Version[]) private versions;
    mapping(bytes32 => bool) private deleted;

    event HashAnchored(string recordType, uint256 recordId, uint256 version,
                       bytes32 hash, uint256 timestamp);
    event RecordMarkedDeleted(string recordType, uint256 recordId, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function _key(string memory recordType, uint256 recordId) internal pure returns (bytes32) {
        return keccak256(abi.encode(recordType, recordId));
    }

    function anchorHash(string calldata recordType, uint256 recordId, bytes32 hash)
        external onlyOwner returns (uint256)
    {
        bytes32 k = _key(recordType, recordId);
        require(!deleted[k], "Record marked deleted");
        versions[k].push(Version(hash, block.timestamp));
        uint256 v = versions[k].length;
        emit HashAnchored(recordType, recordId, v, hash, block.timestamp);
        return v;
    }

    function markDeleted(string calldata recordType, uint256 recordId) external onlyOwner {
        bytes32 k = _key(recordType, recordId);
        require(versions[k].length > 0, "Nothing anchored");
        deleted[k] = true;
        emit RecordMarkedDeleted(recordType, recordId, block.timestamp);
    }

    function getLatest(string calldata recordType, uint256 recordId)
        external view
        returns (bytes32 hash, uint256 version, uint256 timestamp, bool isDeleted)
    {
        bytes32 k = _key(recordType, recordId);
        uint256 n = versions[k].length;
        isDeleted = deleted[k];
        if (n == 0) {
            return (bytes32(0), 0, 0, isDeleted);
        }
        Version memory latest = versions[k][n - 1];
        return (latest.hash, n, latest.timestamp, isDeleted);
    }

    function verify(string calldata recordType, uint256 recordId, bytes32 currentHash)
        external view returns (bool)
    {
        bytes32 k = _key(recordType, recordId);
        uint256 n = versions[k].length;
        if (n == 0 || deleted[k]) {
            return false;
        }
        return versions[k][n - 1].hash == currentHash;
    }

    function versionCount(string calldata recordType, uint256 recordId)
        external view returns (uint256)
    {
        return versions[_key(recordType, recordId)].length;
    }

    function getVersion(string calldata recordType, uint256 recordId, uint256 index)
        external view returns (bytes32, uint256)
    {
        Version memory v = versions[_key(recordType, recordId)][index];
        return (v.hash, v.timestamp);
    }
}
```

- [ ] **Step 2: Run the tests**

Run (from `blockchain/`): `npx hardhat test`
Expected: all 17 tests PASS. If any fail, read the failure, fix the contract (never weaken the test), and rerun.

- [ ] **Step 3: Write journal entry `docs/journal/07-contract.md`** explaining each function in plain English, the test output, and concepts (mapping, struct, modifier, `msg.sender`, `view`, `calldata` vs `memory`, `require`, `emit`, `bytes32`).

- [ ] **Step 4: Commit**

```bash
git add blockchain/contracts docs/journal/07-contract.md
git commit -m "feat: implement IntegrityRegistry contract"
```

---

### Task 3.3: Run the local chain and deploy

**Files:**
- Create: `blockchain/scripts/deploy.js`
- Generated (gitignored): `blockchain/deployment.json`

**Interfaces:**
- Produces: `blockchain/deployment.json` with `{ "address": "0x...", "abi": [...] }`, consumed by `python/chain.py` in Task 5.2.

- [ ] **Step 1: Write the deploy script**

```javascript
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("IntegrityRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  const artifact = await hre.artifacts.readArtifact("IntegrityRegistry");
  const out = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(out, JSON.stringify({ address, abi: artifact.abi }, null, 2));
  console.log("IntegrityRegistry deployed to", address);
  console.log("Wrote", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Start the local chain in a separate background terminal**

Run (from `blockchain/`): `npx hardhat node`
Expected: prints "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/" and a list of 20 test accounts with 10000 fake ETH each, plus their private keys. Those keys are public test keys; they never hold real value.

- [ ] **Step 3: Deploy**

Run (from `blockchain/`): `npx hardhat run scripts/deploy.js --network localhost`
Expected: `IntegrityRegistry deployed to 0x5FbDB2315678afecb367f032d93F642f64180aa3` (first deployment from a fresh node gives this same address).

- [ ] **Step 4: Prove the deployed contract works from outside Hardhat's test runner**

Run a one-off check with the Python environment:
`python/.venv/Scripts/python.exe -c "import json; from web3 import Web3; w=Web3(Web3.HTTPProvider('http://127.0.0.1:8545')); d=json.load(open('blockchain/deployment.json')); c=w.eth.contract(address=d['address'], abi=d['abi']); print('owner:', c.functions.owner().call()); print('connected:', w.is_connected())"`
Expected: `connected: True` and an owner address equal to the first node account (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`). This confirms web3.py v8 can read our contract.

- [ ] **Step 5: Write journal entry `docs/journal/08-deploy.md`** (node, accounts, transaction, gas, ABI, deployment.json; note that stopping the node erases the chain).

- [ ] **Step 6: Commit**

```bash
git add blockchain/scripts docs/journal/08-deploy.md
git commit -m "feat: add deploy script and verify deployment"
```

---

## Self-review

- **Spec coverage:** PDF 7.4 functions and events, 8.5 five tests, and the four extra tests in the master plan (unknown record, nothing anchored, version history, event emission) all map to tasks above. Gas (3.4 in the old numbering) is Phase 4.
- **Placeholders:** none; every code step has full code.
- **Type consistency:** names (`anchorHash`, `markDeleted`, `getLatest`, `verify`, `versionCount`, `getVersion`, `HashAnchored`, `RecordMarkedDeleted`, `deployment.json`) match across tasks and the master plan.
- **Test count:** 17 tests, counted from the test file (anchoring 5, versioning 4, events 2, deletion 3, access control 3).
