# Step 17: The MerkleRegistry contract

Date: 2026-10-05
Phase / Task: Phase 6, Task 6.2

## Goal
A contract that stores Merkle ROOTS (one per batch of records) and can also
verify a Merkle proof on-chain.

## Why a separate contract
We could have added `anchorRoot` to `IntegrityRegistry`. We built a new contract
`MerkleRegistry` instead:
- `IntegrityRegistry` is finished, tested (24 tests) and deployed. Changing it
  risks breaking something that works, and a deployed contract cannot be edited.
- The two do different jobs: one tracks versions of individual records, the other
  stores batch roots. One contract with one job is easier to explain and test.
- Cost: two contracts and two deployment files. Fine at this size.

## What we did
Test first, as always:
1. Wrote `blockchain/test/MerkleRegistry.test.js` (10 tests); ran it:
   `HH700: Artifact for contract "MerkleRegistry" not found` (expected).
2. Wrote `blockchain/contracts/MerkleRegistry.sol`; all tests green.
3. Wrote `blockchain/scripts/deploy_merkle.js` and deployed it to the running
   local node. It writes `blockchain/merkle_deployment.json` (git-ignored, like
   `deployment.json`).

## Output / evidence
```
Before:  HH700: Artifact for contract "MerkleRegistry" not found
After:   34 passing  (24 existing + 10 new)
Deploy:  MerkleRegistry deployed to 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Python:  owner 0xf39Fd6e5...2266 | batchCount 0
```
The address is the second one a fresh Hardhat node gives account #0, because an
address comes from the deployer's address and transaction count (Step 08). The
first (`IntegrityRegistry`) used nonce 0; this one used nonce 1.

## The contract in plain terms
- `anchorRoot(root, count)`: owner only. Appends a `Batch {root, count,
  timestamp}` and returns its number (0, 1, 2, ...). Rejects `count == 0`.
- `getBatch(id)` and `batchCount()`: anyone can read.
- `verify(batchId, leaf, proof)`: recomputes the root from a leaf and its sibling
  list, exactly like Python's `verify_proof`, and compares it with the stored
  root. It is a `view`, so calling it from outside costs no gas.
- `_hashPair(a, b)`: the smaller hash goes first, then `keccak256(0x01 || smaller
  || larger)`. In Solidity `a < b` on `bytes32` compares them as big-endian
  numbers, which orders them the same way Python compares `bytes`
  lexicographically. That equivalence is what keeps the two languages in
  agreement.
- Leaf: `keccak256(0x00 || leaf)`.

## Tests, in groups
| Group | What it protects |
|-------|------------------|
| anchoring (4 tests) | stores root, count, timestamp; sequential ids; event emitted; non-owner and empty batches rejected |
| reading | unknown batch reverts |
| proof checking (5 tests) | valid proof for every leaf of a hand-built 3-leaf tree (which exercises the "unpaired node promoted" case); forged leaf, tampered proof, wrong batch and unknown batch all rejected |

The JavaScript test builds its own 3-leaf tree by hand with the same rules. That
is a first, independent check that the contract matches the rules. The real
Python-versus-Solidity check is Task 6.3.

## Mutation checks (we broke the contract on purpose; each confirmed applied)
| Bug introduced | Result |
|----------------|--------|
| pair order reversed (`a > b`) | `verifies a valid proof...` failed |
| owner check removed from `anchorRoot` | `rejects non-owner and empty batches` failed |
| leaf prefix changed from `0x00` to `0x02` | `verifies a valid proof...` failed |
| unknown-batch check loosened to `<=` | `getBatch reverts for an unknown batch` failed |
After restoring: 34 passing. (After the false start in Step 16, this script
compares the file before and after each change and refuses to trust a result if
nothing changed.)

## Observations
- **Why verify on-chain at all?** Python can already verify a proof. The on-chain
  `verify` matters because OTHER contracts could call it ("was this record in a
  batch the registry anchored?"), and because it is the clearest evidence that
  Python and Solidity compute the same tree. A third party can check a proof
  using only the chain.
- **Reads are free.** Calling `verify` from outside costs no gas; it only costs
  gas if another contract calls it inside a transaction (the loop runs once per
  proof element, so about log2(N) iterations).
- **Nothing here stores records or their hashes.** A batch is only a root and a
  count. To prove one record you must still hold its leaf and the sibling list,
  and to rebuild those you need the batch's full list of leaves. Task 6.3 and the
  journal discuss what this costs.

## Limitations (stated now, tested in Task 6.3)
- A batch has no notion of a record's "latest version", so the rollback defence
  of `IntegrityRegistry` does not carry over (Task 6.3 has a test for this).
- `count` is just a number the owner supplies; the contract cannot check that a
  root really covers `count` leaves.
- Single owner key, as before.

## Concepts met in this step
On-chain proof verification, big-endian ordering of `bytes32`, why separate
contracts, a view function in a loop. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: only store roots; do all proof checking in Python.
- Proper (what we built): also verify proofs in Solidity.
- Tradeoff: about 15 more lines of contract, in exchange for a trustless check
  that anyone, including other contracts, can run, and a built-in cross-check on
  our hashing rules.

## What I should be able to explain after this
(Write this yourself: why does a batch cost one transaction however many records
it covers, and what can the contract NOT check about a root it is given?)
