# Phase 6: Merkle Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor many records' hashes with a single blockchain transaction by anchoring only the root of a Merkle tree, prove any one record with a short proof, and measure how much gas this saves compared with one transaction per record.

**Architecture:** A pure-Python Merkle tree (`merkle.py`) builds a root and per-leaf proofs. A new, separate contract `MerkleRegistry` stores batch roots (append-only) and can also verify a proof on-chain, using the identical hashing rules as Python. A `MerkleChain` Python class (a subclass of the existing `Chain`) talks to it. The production `IntegrityRegistry` and its 24 tests are not modified.

**Tech Stack:** Python 3.14 (`eth_utils.keccak`, installed with web3), Solidity 0.8.24, Hardhat 2.29, pytest, chai.

**Spec:** PDF section 11 ("Merkle batching"), section 10 (scalability). Master plan Phase 6.

## Global Constraints

- **Hash function:** Keccak-256 (Ethereum's native hash, so Solidity can verify proofs cheaply). Leaves are our existing 32-byte HMAC digests.
- **Domain separation:** leaf node = `keccak256(0x00 || leaf)`; internal node = `keccak256(0x01 || min(a,b) || max(a,b))`. The different prefixes are defence in depth against a "second preimage" attack (passing an internal node off as a leaf). With our fixed 32-byte leaves the attack is already impossible, because a leaf hash covers 33 bytes and an internal node 65; the prefixes would matter for variable-length leaves. The formula test pins them.
- **Sorted pairs:** the two child hashes are ordered (smaller first, byte-wise) before hashing, so a proof is just a list of sibling hashes with no left/right flags. Consequence: order *within* a pair does not change the root; order across pairs does.
- **Odd node counts:** an unpaired node is promoted to the next level unchanged. It is never duplicated (duplicating makes `[a,b,c]` and `[a,b,c,c]` share a root, a known Bitcoin flaw).
- Python and Solidity MUST produce identical roots and accept identical proofs. A cross-language test enforces this (Task 6.3).
- Gas numbers come only from real receipts. No extrapolated or assumed figures are reported as measurements.
- The existing `IntegrityRegistry` contract, `chain.py` behaviour, and all existing tests stay unchanged. Existing suites must still pass: Hardhat 24, Python 43.
- Batching is a standalone mechanism in this phase. Integrating it into `notes.py` (a batch queue) is out of scope and is written up as a limitation.

## Honest limitation to build a test for

A Merkle batch contains no notion of "latest version" of a record. If note 1 is anchored in batch A and edited then anchored again in batch B, the OLD content still verifies against batch A. Per-record contracts (`IntegrityRegistry`) defeat rollback attacks because only the latest version is valid; batching gives that up unless extra machinery is added (a per-record latest pointer). Task 6.3 includes a test that documents this, and the journal explains the tradeoff.

## File structure

| File | Responsibility |
|------|----------------|
| `python/merkle.py` | `leaf_hash`, `node_hash`, `MerkleTree`, `verify_proof` |
| `python/tests/test_merkle.py` | Pure Merkle tests (no chain needed) |
| `blockchain/contracts/MerkleRegistry.sol` | Stores batch roots, verifies proofs |
| `blockchain/test/MerkleRegistry.test.js` | Contract tests |
| `blockchain/scripts/deploy_merkle.js` | Deploys `MerkleRegistry`, writes `blockchain/merkle_deployment.json` (gitignored) |
| `python/merkle_chain.py` | `MerkleChain(Chain)`: `anchor_root`, `get_batch`, `batch_count`, `verify_on_chain` |
| `python/tests/test_merkle_chain.py` | Python-vs-Solidity cross-check and the rollback-limitation test |
| `blockchain/scripts/measure_merkle_gas.js` | Gas comparison: N single anchors vs one root |
| `python/merkle_demo.py` | Command-line demo |
| `docs/journal/16-merkle-tree.md`, `17-merkle-contract.md`, `18-merkle-chain.md`, `19-merkle-gas.md` | Journal |

---

### Task 6.1: The Merkle tree in Python (TDD)

**Why:** A Merkle tree turns N hashes into one root. Anyone holding the root can check that one specific hash was in the batch using only about log2(N) sibling hashes, without seeing the other records.

**Files:**
- Create: `python/tests/test_merkle.py`, `python/merkle.py`

**Interfaces:**
- Produces:
  - `merkle.leaf_hash(leaf: bytes) -> bytes` (32 bytes; raises `ValueError` unless `leaf` is exactly 32 bytes)
  - `merkle.node_hash(a: bytes, b: bytes) -> bytes` (order-independent)
  - `merkle.MerkleTree(leaves: list[bytes])` (raises `ValueError` if empty); attribute-style `root -> bytes`; `len(tree)`; `proof(index: int) -> list[bytes]` (raises `IndexError` if out of range)
  - `merkle.verify_proof(leaf: bytes, proof: list[bytes], root: bytes) -> bool`

- [ ] **Step 1: Write the failing tests**

`python/tests/test_merkle.py`:
```python
import pytest
from eth_utils import keccak

from merkle import MerkleTree, leaf_hash, node_hash, verify_proof


def leaves(n):
    return [keccak(f"record {i}".encode()) for i in range(n)]


def test_single_leaf_root_is_its_leaf_hash_and_proof_is_empty():
    (a,) = leaves(1)
    tree = MerkleTree([a])
    assert tree.root == leaf_hash(a)
    assert tree.proof(0) == []
    assert verify_proof(a, [], tree.root)


def test_two_leaves_root_follows_the_documented_formula():
    a, b = leaves(2)
    la = keccak(b"\x00" + a)
    lb = keccak(b"\x00" + b)
    lo, hi = sorted([la, lb])
    expected = keccak(b"\x01" + lo + hi)
    assert MerkleTree([a, b]).root == expected


def test_every_leaf_verifies_for_every_size_from_1_to_33():
    for size in range(1, 34):
        items = leaves(size)
        tree = MerkleTree(items)
        for i, item in enumerate(items):
            assert verify_proof(item, tree.proof(i), tree.root), (size, i)


def test_wrong_leaf_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(keccak(b"not in the tree"), tree.proof(3), tree.root)


def test_wrong_root_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(items[3], tree.proof(3), keccak(b"another root"))


def test_tampered_proof_element_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    proof = tree.proof(3)
    flipped = bytes([proof[0][0] ^ 0x01]) + proof[0][1:]
    assert not verify_proof(items[3], [flipped] + proof[1:], tree.root)


def test_proof_for_one_leaf_does_not_verify_another_leaf():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(items[4], tree.proof(3), tree.root)


def test_odd_leaf_count_is_not_confused_with_a_duplicated_last_leaf():
    a, b, c = leaves(3)
    assert MerkleTree([a, b, c]).root != MerkleTree([a, b, c, c]).root


def test_an_internal_node_cannot_be_passed_off_as_a_leaf():
    a, b, c, d = leaves(4)
    tree = MerkleTree([a, b, c, d])
    n01 = node_hash(leaf_hash(a), leaf_hash(b))
    n23 = node_hash(leaf_hash(c), leaf_hash(d))
    assert node_hash(n01, n23) == tree.root           # sanity: our reading of the tree is right
    assert not verify_proof(n01, [n23], tree.root)    # domain separation blocks the forgery


def test_same_leaves_give_the_same_root():
    assert MerkleTree(leaves(10)).root == MerkleTree(leaves(10)).root


def test_order_within_a_pair_is_irrelevant_but_across_pairs_matters():
    a, b, c, d = leaves(4)
    assert MerkleTree([a, b, c, d]).root == MerkleTree([b, a, c, d]).root   # swap inside a pair
    assert MerkleTree([a, b, c, d]).root != MerkleTree([a, c, b, d]).root   # move across pairs


def test_empty_leaf_list_is_rejected():
    with pytest.raises(ValueError):
        MerkleTree([])


@pytest.mark.parametrize("bad", [b"", b"x" * 31, b"x" * 33, "a string"])
def test_leaves_must_be_exactly_32_bytes(bad):
    with pytest.raises(ValueError):
        leaf_hash(bad)


def test_proof_length_is_logarithmic():
    assert len(MerkleTree(leaves(8)).proof(0)) == 3
    assert len(MerkleTree(leaves(16)).proof(5)) == 4
    assert all(len(MerkleTree(leaves(100)).proof(i)) <= 7 for i in range(100))


def test_index_out_of_range_raises():
    tree = MerkleTree(leaves(4))
    with pytest.raises(IndexError):
        tree.proof(4)
    with pytest.raises(IndexError):
        tree.proof(-1)
```

- [ ] **Step 2: Run and confirm failure**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_merkle.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'merkle'`.

- [ ] **Step 3: Implement `python/merkle.py`**

```python
from eth_utils import keccak

LEAF_PREFIX = b"\x00"
NODE_PREFIX = b"\x01"


def _check_leaf(leaf):
    if not isinstance(leaf, (bytes, bytearray)) or len(leaf) != 32:
        raise ValueError("A leaf must be exactly 32 bytes")


def leaf_hash(leaf: bytes) -> bytes:
    _check_leaf(leaf)
    return keccak(LEAF_PREFIX + bytes(leaf))


def node_hash(a: bytes, b: bytes) -> bytes:
    lo, hi = (a, b) if a <= b else (b, a)      # sorted pair: proofs need no left/right flags
    return keccak(NODE_PREFIX + lo + hi)


class MerkleTree:
    def __init__(self, leaves):
        if not leaves:
            raise ValueError("Cannot build a tree with no leaves")
        level = [leaf_hash(leaf) for leaf in leaves]
        self._levels = [level]
        while len(level) > 1:
            upper = []
            for i in range(0, len(level), 2):
                if i + 1 < len(level):
                    upper.append(node_hash(level[i], level[i + 1]))
                else:
                    upper.append(level[i])     # unpaired node is promoted, never duplicated
            self._levels.append(upper)
            level = upper

    @property
    def root(self) -> bytes:
        return self._levels[-1][0]

    def __len__(self):
        return len(self._levels[0])

    def proof(self, index: int):
        if not 0 <= index < len(self):
            raise IndexError("leaf index out of range")
        siblings = []
        for level in self._levels[:-1]:
            sibling = index ^ 1                # the other child of the same parent
            if sibling < len(level):
                siblings.append(level[sibling])
            index //= 2
        return siblings


def verify_proof(leaf: bytes, proof, root: bytes) -> bool:
    computed = leaf_hash(leaf)
    for sibling in proof:
        computed = node_hash(computed, sibling)
    return computed == root
```

- [ ] **Step 4: Run Merkle tests, then the whole Python suite**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_merkle.py -q` then `.venv/Scripts/python.exe -m pytest -q`
Expected: `18 passed` for the file (15 test functions; one is parametrized four ways); whole suite `61 passed` (43 + 18).
Count note: if pytest reports a different number, trust pytest's number and record it in the journal.

- [ ] **Step 5: Mutation checks (each separately; restore after)**

1. In `node_hash`, delete the sorting (use `a + b` order): expect `test_order_within_a_pair...` and every proof test beyond 2 leaves to fail.
2. Change `NODE_PREFIX` to equal `LEAF_PREFIX`: expect `test_an_internal_node_cannot_be_passed_off_as_a_leaf` to fail.
3. In `MerkleTree.__init__`, duplicate the unpaired node (`level[i], level[i]` hashed together): expect `test_odd_leaf_count_is_not_confused_with_a_duplicated_last_leaf` to fail.

- [ ] **Step 6: Journal `docs/journal/16-merkle-tree.md`, tick 6.1 in the master plan, commit**

Explain with a small ASCII drawing of a 4-leaf tree, why a proof is only log2(N) hashes, domain separation, sorted pairs, odd-count promotion, and the mutation results.

```bash
git add python/merkle.py python/tests/test_merkle.py docs/journal/16-merkle-tree.md docs/00-master-plan.md
git commit -m "feat: add Merkle tree with proofs and tests"
```

---

### Task 6.2: The MerkleRegistry contract (TDD)

**Files:**
- Create: `blockchain/test/MerkleRegistry.test.js`, `blockchain/contracts/MerkleRegistry.sol`, `blockchain/scripts/deploy_merkle.js`
- Modify: `.gitignore` (add `blockchain/merkle_deployment.json`)

**Interfaces:**
- Produces: contract `MerkleRegistry` with
  - `owner() -> address`
  - `anchorRoot(bytes32 root, uint256 count) -> uint256 batchId` (owner only; reverts `"Empty batch"` if `count == 0`)
  - `getBatch(uint256 batchId) -> (bytes32 root, uint256 count, uint256 timestamp)` (reverts `"Unknown batch"`)
  - `batchCount() -> uint256`
  - `verify(uint256 batchId, bytes32 leaf, bytes32[] proof) -> bool` (reverts `"Unknown batch"`)
  - event `RootAnchored(uint256 indexed batchId, bytes32 root, uint256 count, uint256 timestamp)`
- Hashing rules identical to `merkle.py` (see Global Constraints).

- [ ] **Step 1: Write the failing tests**

`blockchain/test/MerkleRegistry.test.js`:
```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Same rules as python/merkle.py
const leafHash = (leaf) => ethers.keccak256(ethers.concat(["0x00", leaf]));
const pairHash = (a, b) => {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat(["0x01", lo, hi]));
};

describe("MerkleRegistry", function () {
  let registry, other;
  const leaf = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const l0 = leaf("record 0"), l1 = leaf("record 1"), l2 = leaf("record 2");

  // Hand-built 3-leaf tree: level 0 = [h0, h1, h2]; level 1 = [pair(h0,h1), h2 promoted]
  const h0 = leafHash(l0), h1 = leafHash(l1), h2 = leafHash(l2);
  const n01 = pairHash(h0, h1);
  const root = pairHash(n01, h2);
  const proofs = { 0: [h1, h2], 1: [h0, h2], 2: [n01] };

  beforeEach(async () => {
    [, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MerkleRegistry");
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it("anchors a root and returns it with count and timestamp", async () => {
    await registry.anchorRoot(root, 3);
    const [r, count, ts] = await registry.getBatch(0);
    expect(r).to.equal(root);
    expect(count).to.equal(3n);
    expect(ts).to.be.greaterThan(0n);
  });

  it("numbers batches sequentially", async () => {
    expect(await registry.anchorRoot.staticCall(root, 3)).to.equal(0n);
    await registry.anchorRoot(root, 3);
    expect(await registry.anchorRoot.staticCall(leaf("other"), 1)).to.equal(1n);
    await registry.anchorRoot(leaf("other"), 1);
    expect(await registry.batchCount()).to.equal(2n);
  });

  it("emits RootAnchored", async () => {
    await expect(registry.anchorRoot(root, 3))
      .to.emit(registry, "RootAnchored")
      .withArgs(0, root, 3, anyValue);
  });

  it("rejects non-owner and empty batches", async () => {
    await expect(registry.connect(other).anchorRoot(root, 3)).to.be.revertedWith("Not authorized");
    await expect(registry.anchorRoot(root, 0)).to.be.revertedWith("Empty batch");
  });

  it("getBatch reverts for an unknown batch", async () => {
    await expect(registry.getBatch(0)).to.be.revertedWith("Unknown batch");
  });

  it("verifies a valid proof for every leaf of the 3-leaf tree", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, l0, proofs[0])).to.equal(true);
    expect(await registry.verify(0, l1, proofs[1])).to.equal(true);
    expect(await registry.verify(0, l2, proofs[2])).to.equal(true);
  });

  it("rejects a leaf that is not in the batch", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, leaf("forged"), proofs[0])).to.equal(false);
  });

  it("rejects a tampered proof", async () => {
    await registry.anchorRoot(root, 3);
    expect(await registry.verify(0, l0, [h1, leaf("tampered")])).to.equal(false);
  });

  it("rejects a proof checked against the wrong batch", async () => {
    await registry.anchorRoot(root, 3);
    await registry.anchorRoot(leaf("unrelated root"), 3);
    expect(await registry.verify(1, l0, proofs[0])).to.equal(false);
  });

  it("verify reverts for an unknown batch", async () => {
    await expect(registry.verify(5, l0, proofs[0])).to.be.revertedWith("Unknown batch");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run (from `blockchain/`): `npx hardhat test test/MerkleRegistry.test.js`
Expected: `HH700: Artifact for contract "MerkleRegistry" not found`.

- [ ] **Step 3: Write the contract**

`blockchain/contracts/MerkleRegistry.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Stores Merkle roots, one per batch of records, and can verify a proof on-chain.
// Hashing rules are identical to python/merkle.py:
//   leaf node     = keccak256(0x00 || leaf)
//   internal node = keccak256(0x01 || smaller || larger)
contract MerkleRegistry {
    address public owner;

    struct Batch {
        bytes32 root;
        uint256 count;
        uint256 timestamp;
    }

    Batch[] private batches;

    event RootAnchored(uint256 indexed batchId, bytes32 root, uint256 count, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorRoot(bytes32 root, uint256 count) external onlyOwner returns (uint256 batchId) {
        require(count > 0, "Empty batch");
        batchId = batches.length;
        batches.push(Batch(root, count, block.timestamp));
        emit RootAnchored(batchId, root, count, block.timestamp);
    }

    function getBatch(uint256 batchId)
        external view returns (bytes32 root, uint256 count, uint256 timestamp)
    {
        require(batchId < batches.length, "Unknown batch");
        Batch memory b = batches[batchId];
        return (b.root, b.count, b.timestamp);
    }

    function batchCount() external view returns (uint256) {
        return batches.length;
    }

    function verify(uint256 batchId, bytes32 leaf, bytes32[] calldata proof)
        external view returns (bool)
    {
        require(batchId < batches.length, "Unknown batch");
        bytes32 computed = keccak256(abi.encodePacked(bytes1(0x00), leaf));
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashPair(computed, proof[i]);
        }
        return computed == batches[batchId].root;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(bytes1(0x01), a, b))
            : keccak256(abi.encodePacked(bytes1(0x01), b, a));
    }
}
```

- [ ] **Step 4: Run all Hardhat tests**

Run (from `blockchain/`): `npx hardhat test`
Expected: 34 passing (24 existing + 10 new). Existing contract tests must be unchanged and green.
(Count: the new file has 10 `it(...)` blocks.)

- [ ] **Step 5: Mutation check**

Change `a < b` to `a > b` in `_hashPair` (wrong ordering): expect the "verifies a valid proof" test to fail. Restore.

- [ ] **Step 6: Deploy script**

`blockchain/scripts/deploy_merkle.js`:
```javascript
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("MerkleRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  const artifact = await hre.artifacts.readArtifact("MerkleRegistry");
  const out = path.join(__dirname, "..", "merkle_deployment.json");
  fs.writeFileSync(out, JSON.stringify({ address, abi: artifact.abi }, null, 2));
  console.log("MerkleRegistry deployed to", address);
  console.log("Wrote", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
```
Add `blockchain/merkle_deployment.json` to `.gitignore`.
Run (node must be running): `npx hardhat run scripts/deploy_merkle.js --network localhost`
Expected: prints `MerkleRegistry deployed to 0x...`; `git status` does not list `merkle_deployment.json`.

- [ ] **Step 7: Journal `docs/journal/17-merkle-contract.md`, tick in master plan, commit**

```bash
git add blockchain/contracts/MerkleRegistry.sol blockchain/test/MerkleRegistry.test.js blockchain/scripts/deploy_merkle.js .gitignore docs/journal/17-merkle-contract.md docs/00-master-plan.md
git commit -m "feat: add MerkleRegistry contract with on-chain proof verification"
```

---

### Task 6.3: Python talks to MerkleRegistry; cross-language check (TDD)

**Files:**
- Modify: `python/settings.py` (add `merkle_deployment_file()`), `python/conftest.py` (add `merkle_chain` fixture)
- Create: `python/tests/test_merkle_chain.py`, `python/merkle_chain.py`

**Interfaces:**
- Consumes: `chain.Chain` (`connect`, `_run`, `snapshot`, `revert`), `merkle.MerkleTree`, `merkle.verify_proof`.
- Produces: `settings.merkle_deployment_file() -> pathlib.Path` (env `MERKLE_DEPLOYMENT_FILE` overrides; default `blockchain/merkle_deployment.json`); class `merkle_chain.MerkleChain(Chain)` with
  - `anchor_root(root: bytes, count: int) -> dict` keys `batch_id: int`, `tx_hash: str`, `block_number: int`, `gas_used: int`
  - `get_batch(batch_id: int) -> dict` keys `root: bytes`, `count: int`, `timestamp: int`
  - `batch_count() -> int`
  - `verify_on_chain(batch_id: int, leaf: bytes, proof: list[bytes]) -> bool`

- [ ] **Step 1: Add the setting and fixture**

Append to `python/settings.py`:
```python
def merkle_deployment_file() -> Path:
    override = os.environ.get("MERKLE_DEPLOYMENT_FILE")
    return Path(override) if override else PROJECT_ROOT / "blockchain" / "merkle_deployment.json"
```

Add to `python/conftest.py` (after the existing fixtures; add `from merkle_chain import MerkleChain` to the imports at the top):
```python
@pytest.fixture(scope="session")
def _live_merkle_chain():
    c = MerkleChain()
    try:
        c.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        pytest.skip(f"MerkleRegistry not available ({exc}). Run "
                    "'npx hardhat run scripts/deploy_merkle.js --network localhost'.")
    return c


@pytest.fixture
def merkle_chain(_live_merkle_chain):
    snapshot = _live_merkle_chain.snapshot()
    yield _live_merkle_chain
    _live_merkle_chain.revert(snapshot)
```
Because `conftest.py` will import `merkle_chain`, create the module in Step 3 before running anything; the failing-test run in Step 2 uses `--noconftest`.

- [ ] **Step 2: Write the failing tests**

`python/tests/test_merkle_chain.py`:
```python
import pytest
from eth_utils import keccak

from merkle import MerkleTree, verify_proof
from merkle_chain import MerkleChain
from chain import ChainUnavailable


def leaves(n, prefix="record"):
    return [keccak(f"{prefix} {i}".encode()) for i in range(n)]


def test_anchor_root_then_get_batch(merkle_chain):
    tree = MerkleTree(leaves(5))
    result = merkle_chain.anchor_root(tree.root, 5)
    assert result["batch_id"] == 0
    assert result["gas_used"] > 0
    batch = merkle_chain.get_batch(0)
    assert batch["root"] == tree.root and batch["count"] == 5 and batch["timestamp"] > 0


def test_batches_are_numbered_sequentially(merkle_chain):
    assert merkle_chain.anchor_root(MerkleTree(leaves(2)).root, 2)["batch_id"] == 0
    assert merkle_chain.anchor_root(MerkleTree(leaves(3)).root, 3)["batch_id"] == 1
    assert merkle_chain.batch_count() == 2


def test_python_proofs_are_accepted_by_the_solidity_contract(merkle_chain):
    # The cross-language check: same hashing rules in Python and Solidity.
    for size in (1, 2, 3, 7, 8, 13):
        items = leaves(size, prefix=f"size{size}")
        tree = MerkleTree(items)
        batch_id = merkle_chain.anchor_root(tree.root, size)["batch_id"]
        for i, item in enumerate(items):
            proof = tree.proof(i)
            assert verify_proof(item, proof, tree.root)
            assert merkle_chain.verify_on_chain(batch_id, item, proof), (size, i)


def test_contract_rejects_a_leaf_that_is_not_in_the_batch(merkle_chain):
    items = leaves(7)
    tree = MerkleTree(items)
    batch_id = merkle_chain.anchor_root(tree.root, 7)["batch_id"]
    assert not merkle_chain.verify_on_chain(batch_id, keccak(b"forged"), tree.proof(2))


def test_old_batch_still_verifies_old_content__documented_limitation(merkle_chain):
    # Batching has no "latest version" rule: an edited record's OLD content still
    # verifies against the OLD batch. A per-record contract would reject it (Step 07).
    old = keccak(b"note 1: original text")
    new = keccak(b"note 1: edited text")
    filler = keccak(b"another record")
    batch_a = merkle_chain.anchor_root(MerkleTree([old, filler]).root, 2)["batch_id"]
    merkle_chain.anchor_root(MerkleTree([new, filler]).root, 2)           # the edit, anchored later
    assert merkle_chain.verify_on_chain(batch_a, old, MerkleTree([old, filler]).proof(0))


def test_unreachable_node_raises_chain_unavailable():
    dead = MerkleChain(rpc_url="http://127.0.0.1:9")
    with pytest.raises(ChainUnavailable):
        dead.batch_count()
```

- [ ] **Step 3: Write `python/merkle_chain.py`, then confirm the tests fail first**

Order for TDD: first run `.venv/Scripts/python.exe -m pytest tests/test_merkle_chain.py -q --noconftest` and expect `ModuleNotFoundError: No module named 'merkle_chain'`. Then create:

```python
import settings
from chain import Chain


class MerkleChain(Chain):
    """Talks to the MerkleRegistry contract. Reuses Chain's connection handling."""

    def __init__(self, rpc_url=None, deployment_file=None):
        super().__init__(rpc_url=rpc_url,
                         deployment_file=deployment_file or settings.merkle_deployment_file())

    def anchor_root(self, root, count):
        def act(w3, contract):
            tx = contract.functions.anchorRoot(root, count).transact({"from": w3.eth.accounts[0]})
            receipt = w3.eth.wait_for_transaction_receipt(tx)
            events = contract.events.RootAnchored().process_receipt(receipt)
            return {
                "batch_id": events[0]["args"]["batchId"],
                "tx_hash": w3.to_hex(tx),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
            }
        return self._run(act)

    def get_batch(self, batch_id):
        def act(w3, contract):
            root, count, timestamp = contract.functions.getBatch(batch_id).call()
            return {"root": bytes(root), "count": count, "timestamp": timestamp}
        return self._run(act)

    def batch_count(self):
        return self._run(lambda w3, c: c.functions.batchCount().call())

    def verify_on_chain(self, batch_id, leaf, proof):
        return self._run(lambda w3, c: c.functions.verify(batch_id, leaf, list(proof)).call())
```

- [ ] **Step 4: Run the new tests, then everything**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_merkle_chain.py -v` (node running, `MerkleRegistry` deployed)
Expected: 6 passed.
Then `.venv/Scripts/python.exe -m pytest -q`. Expected: the earlier 43 plus the Merkle tests, all passing (report pytest's exact total in the journal).
If the cross-language test fails, the Python and Solidity hashing rules differ: fix the code, never the test.

- [ ] **Step 5: Mutation check**

In `merkle.py` change `NODE_PREFIX` to `b"\x02"`: expect the cross-language test to fail while pure-Python tests still pass (proving the contract and Python must agree). Restore.

- [ ] **Step 6: Journal `docs/journal/18-merkle-chain.md`, tick, commit**

Include the limitation test and its meaning, and the design choice that `MerkleChain` subclasses `Chain`.

```bash
git add python/settings.py python/conftest.py python/merkle_chain.py python/tests/test_merkle_chain.py docs/journal/18-merkle-chain.md docs/00-master-plan.md
git commit -m "feat: add MerkleChain and Python/Solidity cross-check tests"
```

---

### Task 6.4: Gas comparison and demo

**Files:**
- Create: `blockchain/scripts/measure_merkle_gas.js`, `python/merkle_demo.py`

- [ ] **Step 1: Write the gas script**

`blockchain/scripts/measure_merkle_gas.js`:
```javascript
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
```

- [ ] **Step 2: Run it twice**

Run (from `blockchain/`): `npx hardhat run scripts/measure_merkle_gas.js`
Expected: two markdown tables with real integers; identical on a second run. Sanity checks before trusting them: single-record totals grow roughly linearly with N; the Merkle root gas is the same in every row; at N=1 the Merkle approach is NOT cheaper (it stores more per anchor), which is the honest crossover to point out.

- [ ] **Step 3: Write the demo**

`python/merkle_demo.py`:
```python
"""Merkle batching demo: anchor 8 notes with ONE transaction, then prove one of them.

Requires: `npx hardhat node` running and MerkleRegistry deployed
(`npx hardhat run scripts/deploy_merkle.js --network localhost`).
Run (from python/):  .venv/Scripts/python.exe merkle_demo.py
"""
import sys

import db
import integrity
import merkle
from chain import ChainUnavailable
from merkle_chain import MerkleChain


def main():
    chain = MerkleChain()
    try:
        chain.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        sys.exit(f"Cannot run demo: {exc}")
    snapshot = chain.snapshot()
    conn = db.connect(":memory:")

    ids = []
    for i in range(1, 9):
        cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                           (i, f"Note number {i}"))
        ids.append(cur.lastrowid)
    conn.commit()

    print("1. Hash all 8 notes and build a Merkle tree.")
    digests = [integrity.compute_digest("note", integrity.fetch_record(conn, "note", i)) for i in ids]
    tree = merkle.MerkleTree(digests)
    print(f"  root: 0x{tree.root.hex()[:24]}...")

    print("\n2. Anchor the single root: ONE transaction covers all 8 notes.")
    result = chain.anchor_root(tree.root, len(digests))
    print(f"  batch {result['batch_id']}, block {result['block_number']}, gas used {result['gas_used']}")

    target = 2                               # the third note
    proof = tree.proof(target)
    print(f"\n3. To prove note {ids[target]} we need only {len(proof)} sibling hashes "
          f"({len(proof) * 32} bytes), not the other notes.")

    def check(label):
        record = integrity.fetch_record(conn, "note", ids[target])
        digest = integrity.compute_digest("note", record)
        root = chain.get_batch(result["batch_id"])["root"]
        in_python = merkle.verify_proof(digest, proof, root)
        on_chain = chain.verify_on_chain(result["batch_id"], digest, proof)
        verdict = lambda ok: "VERIFIED" if ok else "TAMPERED"
        print(f"  {label:<36} python: {verdict(in_python):<9} | contract: {verdict(on_chain)}")

    print("\n4. Verify note 3 against the on-chain root.")
    check("note 3, untouched")

    print("\n5. Someone edits note 3 in the database. Verify again.")
    conn.execute("UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (ids[target],))
    conn.commit()
    check("note 3 after silent edit")

    chain.revert(snapshot)
    print("\n(chain rolled back so the demo can be repeated)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the demo twice**

Run (from `python/`): `.venv/Scripts/python.exe merkle_demo.py`
Expected: step 4 `VERIFIED` in both Python and the contract; step 5 `TAMPERED` in both; identical output on a second run.

- [ ] **Step 5: Journal `docs/journal/19-merkle-gas.md`**

Paste both tables and the demo output. Write the conclusions only from the measured numbers: the saving percentage at each N, where batching stops being worthwhile (N=1), whether the Step 10 hypothesis ("saving far larger than 2.4%") held, proof size growth. Then the tradeoffs: a record is not individually on-chain (a proof is needed and the leaf list must be stored to rebuild proofs), anchoring waits for a batch to fill (a longer window in which a record could change before it is anchored), the lost latest-version rule (the documented-limitation test), and edits require a new batch. State what would be needed to combine batching with rollback protection (a per-record latest pointer anchored alongside), without implementing it.

- [ ] **Step 6: Run everything, tick Phase 6, commit**

Run: `cd blockchain && npx hardhat test` (34 passing) and `cd ../python && .venv/Scripts/python.exe -m pytest -q` (all passing).
```bash
git add blockchain/scripts/measure_merkle_gas.js python/merkle_demo.py docs/journal/19-merkle-gas.md docs/00-master-plan.md
git commit -m "feat: add Merkle gas comparison and demo"
```

---

## Self-review

- **Spec coverage:** PDF section 11 (Merkle batching, one transaction for many records, short proof per record) is covered by tasks 6.1-6.4. The cost-versus-granularity tradeoff and the loss of the latest-version rule are covered by a documented test and the journal.
- **Placeholders:** none. Test totals that depend on counting parametrized tests are explicitly marked "trust pytest's number" instead of being asserted.
- **Type consistency:** hashing rules (prefixes, sorted pairs, promotion) are identical in `merkle.py`, `MerkleRegistry.sol` and the JS test helper; names `anchor_root`, `get_batch`, `batch_count`, `verify_on_chain`, `batch_id`, `gas_used` are consistent between `merkle_chain.py`, the tests and the demo; the contract's `anchorRoot`, `getBatch`, `batchCount`, `verify`, `RootAnchored` match the Python calls.
- **Existing work untouched:** `IntegrityRegistry.sol`, `chain.py`, `integrity.py`, `notes.py` are not edited (only `settings.py` and `conftest.py` gain additions).
- **Counts:** Hardhat 24 + 10 = 34. Python: 43 existing + 18 Merkle items (15 functions, one parametrized four ways) + 6 chain tests = 67 expected; the plan tells the executor to trust pytest's reported number.
