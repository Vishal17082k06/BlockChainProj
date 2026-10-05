# Phase 4: Gas Measurement and Event Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure what our contract costs in gas, compare it with a cheaper `bytes32`-key design, and rebuild the list of anchored records from the chain's event logs alone.

**Architecture:** Add one experimental contract variant (`IntegrityRegistryBytes32`) that takes a precomputed 32-byte record key instead of a string type plus id. A measurement script deploys fresh copies of both contracts on Hardhat's in-process chain and prints gas per operation from transaction receipts. A small library function reads `HashAnchored` and `RecordMarkedDeleted` events and reconstructs every record's history.

**Tech Stack:** Solidity 0.8.24, Hardhat 2.29, ethers v6, chai.

**Spec:** PDF sections 3.6 (gas), 7.4, 7.8 and 8 (event logs for stronger deletion detection, "Stronger deletion detection" box, 8.13). Master plan Phase 4.

## Global Constraints

- The production contract `IntegrityRegistry.sol` is NOT modified in this phase. The variant lives in `contracts/experimental/` and is only a measurement subject. If the numbers favour the variant, we decide in the journal whether to adopt it, and write that as a separate change.
- Gas figures come only from real receipts (`receipt.gasUsed`). We never state a gas number or a price that we did not measure or source. Cost in real money = gas used × gas price, and local chains have no real price, so we report gas units only until Phase 7 gives a real Sepolia gas price.
- Event reconstruction must use only chain data, no database.
- Hardhat 2, CommonJS style.

---

## File structure

| File | Responsibility |
|------|----------------|
| `blockchain/contracts/experimental/IntegrityRegistryBytes32.sol` | Cheaper variant: record key passed in as `bytes32` |
| `blockchain/test/IntegrityRegistryBytes32.test.js` | Behaviour of the variant |
| `blockchain/scripts/measure_gas.js` | Deploys both designs, performs the same operations, prints a gas table |
| `blockchain/scripts/lib/anchors.js` | `collectAnchors(registry)`: rebuild records from event logs |
| `blockchain/test/anchors.test.js` | Tests for `collectAnchors` |
| `blockchain/scripts/demo_events.js` | Deploys a fresh contract, anchors demo records, prints them rebuilt from events |
| `docs/journal/09-bytes32-variant.md`, `10-gas.md`, `11-events.md` | Journal entries |

---

### Task 4.1: The bytes32-key variant (TDD)

**Why:** The PDF's contract takes `string recordType` on every call. Strings are sent as calldata and hashed on-chain with `abi.encode`, which costs gas. A variant that takes a ready-made `bytes32` key moves that work off-chain. We build it so the comparison in Task 4.2 uses real code, not guesses.

**Files:**
- Create: `blockchain/test/IntegrityRegistryBytes32.test.js`
- Create: `blockchain/contracts/experimental/IntegrityRegistryBytes32.sol`

**Interfaces:**
- Produces: contract `IntegrityRegistryBytes32` with
  - `owner() -> address`
  - `anchorHash(bytes32 key, bytes32 hash) -> uint256 version` (owner only)
  - `markDeleted(bytes32 key)` (owner only)
  - `verify(bytes32 key, bytes32 currentHash) -> bool`
  - `versionCount(bytes32 key) -> uint256`
  - events `HashAnchored(bytes32 indexed key, uint256 version, bytes32 hash, uint256 timestamp)` and `RecordMarkedDeleted(bytes32 indexed key, uint256 timestamp)`
- Key convention (used by tests and later by Python): `key = keccak256(abi.encode(recordType, recordId))`, the same formula the original contract uses internally. In ethers: `ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string","uint256"], [type, id]))`.

- [ ] **Step 1: Write the failing test**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

function recordKey(type, id) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256"], [type, id])
  );
}

describe("IntegrityRegistryBytes32", function () {
  let registry, other;
  const h1 = ethers.keccak256(ethers.toUtf8Bytes("version one"));
  const h2 = ethers.keccak256(ethers.toUtf8Bytes("version two"));
  const key = recordKey("note", 1);

  beforeEach(async () => {
    [, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("IntegrityRegistryBytes32");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("anchors a hash and verifies it", async () => {
    await registry.anchorHash(key, h1);
    expect(await registry.verify(key, h1)).to.equal(true);
    expect(await registry.verify(key, h2)).to.equal(false);
  });

  it("only the latest version is valid", async () => {
    await registry.anchorHash(key, h1);
    await registry.anchorHash(key, h2);
    expect(await registry.versionCount(key)).to.equal(2n);
    expect(await registry.verify(key, h2)).to.equal(true);
    expect(await registry.verify(key, h1)).to.equal(false);
  });

  it("blocks anchoring after deletion and fails verification", async () => {
    await registry.anchorHash(key, h1);
    await registry.markDeleted(key);
    expect(await registry.verify(key, h1)).to.equal(false);
    await expect(registry.anchorHash(key, h2)).to.be.revertedWith("Record marked deleted");
  });

  it("rejects non-owner writes and unanchored deletes", async () => {
    await expect(registry.connect(other).anchorHash(key, h1)).to.be.revertedWith("Not authorized");
    await expect(registry.markDeleted(key)).to.be.revertedWith("Nothing anchored");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run (from `blockchain/`): `npx hardhat test test/IntegrityRegistryBytes32.test.js`
Expected: FAIL with `HH700: Artifact for contract "IntegrityRegistryBytes32" not found`.

- [ ] **Step 3: Write the variant**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// EXPERIMENT: same behaviour as IntegrityRegistry, but the record key is computed
// off-chain and passed in as bytes32. Used only to measure gas (docs/journal/10-gas.md).
contract IntegrityRegistryBytes32 {
    address public owner;

    struct Version {
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Version[]) private versions;
    mapping(bytes32 => bool) private deleted;

    event HashAnchored(bytes32 indexed key, uint256 version, bytes32 hash, uint256 timestamp);
    event RecordMarkedDeleted(bytes32 indexed key, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorHash(bytes32 key, bytes32 hash) external onlyOwner returns (uint256) {
        require(!deleted[key], "Record marked deleted");
        versions[key].push(Version(hash, block.timestamp));
        uint256 v = versions[key].length;
        emit HashAnchored(key, v, hash, block.timestamp);
        return v;
    }

    function markDeleted(bytes32 key) external onlyOwner {
        require(versions[key].length > 0, "Nothing anchored");
        deleted[key] = true;
        emit RecordMarkedDeleted(key, block.timestamp);
    }

    function verify(bytes32 key, bytes32 currentHash) external view returns (bool) {
        uint256 n = versions[key].length;
        if (n == 0 || deleted[key]) {
            return false;
        }
        return versions[key][n - 1].hash == currentHash;
    }

    function versionCount(bytes32 key) external view returns (uint256) {
        return versions[key].length;
    }
}
```

- [ ] **Step 4: Run all tests**

Run (from `blockchain/`): `npx hardhat test`
Expected: 21 passing (17 original + 4 new), 0 failing.

- [ ] **Step 5: Journal `docs/journal/09-bytes32-variant.md`, then commit**

```bash
git add blockchain/contracts/experimental blockchain/test docs/journal/09-bytes32-variant.md
git commit -m "feat: add experimental bytes32-key registry variant for gas comparison"
```

---

### Task 4.2: Measure gas

**Files:**
- Create: `blockchain/scripts/measure_gas.js`

**Interfaces:**
- Consumes: both contracts from Phase 3 and Task 4.1.
- Produces: a printed markdown table (also pasted into the journal).

- [ ] **Step 1: Write the measurement script**

```javascript
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
```

- [ ] **Step 2: Run it**

Run (from `blockchain/`): `npx hardhat run scripts/measure_gas.js`
Expected: a table with 5 rows and real integers in every cell. It runs on Hardhat's built-in in-process chain, so no node needs to be running and nothing touches our deployed contract.
Sanity checks before trusting the numbers: every cell is a positive integer; "deploy" is by far the largest; first-version and second-version anchors are in the same order of magnitude (tens of thousands to low hundreds of thousands of gas).

- [ ] **Step 3: Interpret honestly in `docs/journal/10-gas.md`**

Paste the table. Write the conclusion from the numbers actually printed: which design is cheaper per operation, by how much in percent, whether the first version costs more than the second and a plausible reason (storage slot going from zero to non-zero is more expensive than changing a non-zero slot), and whether the long type name changes the string design's cost. State plainly if a hypothesis turns out wrong. Do NOT convert gas to money without a sourced gas price; note that Phase 7 (Sepolia) gives a real price.

- [ ] **Step 4: Commit**

```bash
git add blockchain/scripts/measure_gas.js docs/journal/10-gas.md
git commit -m "feat: add gas measurement script and results"
```

---

### Task 4.3: Rebuild anchored records from event logs (TDD)

**Why:** Our database could be edited by an attacker, including its `integrity_log` table. The blockchain's event logs cannot. Rebuilding the list of anchored records from events means "which records should exist?" no longer depends on the database.

**Files:**
- Create: `blockchain/test/anchors.test.js`
- Create: `blockchain/scripts/lib/anchors.js`
- Create: `blockchain/scripts/demo_events.js`

**Interfaces:**
- Produces: `collectAnchors(registry) -> Promise<Array<{ recordType: string, recordId: number, deleted: boolean, versions: Array<{ version: number, hash: string, timestamp: number, blockNumber: number }> }>>`, built only from `HashAnchored` and `RecordMarkedDeleted` events of an `IntegrityRegistry` instance. Order: by first appearance on chain. Python will mirror this in Phase 5.

- [ ] **Step 1: Write the failing test**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { collectAnchors } = require("../scripts/lib/anchors");

describe("collectAnchors (rebuild records from event logs)", function () {
  let registry;
  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  beforeEach(async () => {
    const F = await ethers.getContractFactory("IntegrityRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("returns an empty list for a fresh contract", async () => {
    expect(await collectAnchors(registry)).to.deep.equal([]);
  });

  it("rebuilds versions, order and deletion from events only", async () => {
    await registry.anchorHash("note", 1, h("a"));
    await registry.anchorHash("conversation", 5, h("b"));
    await registry.anchorHash("note", 1, h("c"));   // note 1 gets version 2
    await registry.markDeleted("conversation", 5);

    const records = await collectAnchors(registry);
    expect(records.length).to.equal(2);

    const note = records[0];
    expect(note.recordType).to.equal("note");
    expect(note.recordId).to.equal(1);
    expect(note.deleted).to.equal(false);
    expect(note.versions.map((v) => v.version)).to.deep.equal([1, 2]);
    expect(note.versions.map((v) => v.hash)).to.deep.equal([h("a"), h("c")]);
    expect(note.versions[0].blockNumber).to.be.lessThan(note.versions[1].blockNumber);

    const conv = records[1];
    expect(conv.recordType).to.equal("conversation");
    expect(conv.recordId).to.equal(5);
    expect(conv.deleted).to.equal(true);
  });

  it("agrees with the contract's own latest state", async () => {
    await registry.anchorHash("note", 3, h("x"));
    await registry.anchorHash("note", 3, h("y"));
    const [rec] = await collectAnchors(registry);
    const latest = rec.versions[rec.versions.length - 1];
    const [hash, version] = await registry.getLatest("note", 3);
    expect(latest.hash).to.equal(hash);
    expect(BigInt(latest.version)).to.equal(version);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run (from `blockchain/`): `npx hardhat test test/anchors.test.js`
Expected: FAIL with `Cannot find module '../scripts/lib/anchors'`.

- [ ] **Step 3: Implement**

```javascript
// Rebuild every record's history using ONLY the contract's event logs.
// No database is consulted, so an attacker who edits a database cannot change the answer.
async function collectAnchors(registry) {
  const anchored = await registry.queryFilter(registry.filters.HashAnchored(), 0, "latest");
  const deleted = await registry.queryFilter(registry.filters.RecordMarkedDeleted(), 0, "latest");

  const records = new Map();
  for (const ev of anchored) {
    const { recordType, recordId, version, hash, timestamp } = ev.args;
    const key = `${recordType}:${recordId}`;
    if (!records.has(key)) {
      records.set(key, { recordType, recordId: Number(recordId), deleted: false, versions: [] });
    }
    records.get(key).versions.push({
      version: Number(version),
      hash,
      timestamp: Number(timestamp),
      blockNumber: ev.blockNumber,
    });
  }
  for (const ev of deleted) {
    const key = `${ev.args.recordType}:${ev.args.recordId}`;
    if (records.has(key)) records.get(key).deleted = true;
  }
  return [...records.values()];
}

module.exports = { collectAnchors };
```

- [ ] **Step 4: Run all tests**

Run (from `blockchain/`): `npx hardhat test`
Expected: 24 passing (17 + 4 + 3), 0 failing.

- [ ] **Step 5: Add the demo script**

```javascript
const hre = require("hardhat");
const { collectAnchors } = require("./lib/anchors");

async function main() {
  const { ethers } = hre;
  const F = await ethers.getContractFactory("IntegrityRegistry");
  const registry = await F.deploy();   // fresh copy; does not touch the main deployment
  await registry.waitForDeployment();

  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  await registry.anchorHash("note", 1, h("note 1 v1"));
  await registry.anchorHash("note", 2, h("note 2 v1"));
  await registry.anchorHash("note", 1, h("note 1 v2"));
  await registry.markDeleted("note", 2);

  console.log(JSON.stringify(await collectAnchors(registry), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run (from `blockchain/`): `npx hardhat run scripts/demo_events.js`
Expected: JSON with two records: `note 1` with 2 versions and `deleted: false`, `note 2` with 1 version and `deleted: true`.

- [ ] **Step 6: Journal `docs/journal/11-events.md`, then commit**

Explain events versus storage, why strings in events are not `indexed` (an indexed string is stored only as its hash, so it could not be read back), and the tradeoff versus the bytes32 variant's `indexed key` (which allows cheap per-record filtering). Include the honest limit: reading all events scans the whole chain history, which is fine for a prototype and slow at scale (real systems use an indexer).

```bash
git add blockchain/scripts blockchain/test docs/journal/11-events.md
git commit -m "feat: rebuild anchored records from event logs"
```

---

## Self-review

- **Spec coverage:** gas (PDF 3.6), event-based id source (PDF 8.13 box and 7.8 threat table), and the bytes32 comparison from the master plan are each covered by a task.
- **Placeholders:** none; Task 4.2's conclusion is deliberately written from measured output, not predetermined.
- **Type consistency:** `recordKey` is defined identically in Tasks 4.1 and 4.2; event field names match the contract (`recordType`, `recordId`, `version`, `hash`, `timestamp`); `collectAnchors` signature is the same in the test, the library and the demo.
- **Test counts:** 17 existing + 4 variant + 3 anchors = 24.
- **Production contract untouched:** confirmed by Global Constraints.
