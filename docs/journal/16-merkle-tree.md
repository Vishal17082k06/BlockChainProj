# Step 16: The Merkle tree

Date: 2026-10-05
Phase / Task: Phase 6, Task 6.1

## Goal
Build a Merkle tree in Python: turn many 32-byte hashes into ONE root, and
produce a short proof that any single hash is part of that root.

## The idea
Anchoring one hash per record means one blockchain transaction per record, and
(Step 10) each costs about 97k gas. A Merkle tree lets one transaction cover
many records.

```
            ROOT  <-- the only thing put on the blockchain
           /    \
        N01      N23
       /   \    /   \
     L(a) L(b) L(c) L(d)        L(x) = hash of a record's own hash
```
- Hash each record's digest to get the bottom row (the "leaves").
- Hash pairs together, level by level, until one hash is left: the **root**.
- To prove record `c` was included you do not need a, b or d, only the
  "siblings" along its path: `L(d)` and `N01`. Recompute upward:
  `L(c)` with `L(d)` gives `N23`, then `N23` with `N01` gives ROOT. If the result
  equals the root on the chain, `c` was in the batch.
- A proof therefore has about log2(N) hashes: 3 for 8 records, 7 for 100. Other
  records are not revealed.

## What we did
Test first. Wrote `tests/test_merkle.py` (15 test functions, 18 test cases) and
ran it: `ModuleNotFoundError: No module named 'merkle'`. Then wrote
`python/merkle.py`: `leaf_hash`, `node_hash`, class `MerkleTree` (with `root` and
`proof(index)`), and `verify_proof`.

## Output / evidence
```
Before:  ModuleNotFoundError: No module named 'merkle'
After:   18 passed (merkle tests);  whole Python suite 61 passed (43 + 18)
```

## Design rules (and why)
| Rule | Why |
|------|-----|
| Keccak-256 as the hash | Ethereum's native hash, so a Solidity contract can verify proofs cheaply (Task 6.2) |
| Leaves must be exactly 32 bytes | They are our HMAC digests; also closes a loophole (see finding below) |
| Leaf = `keccak(0x00 || leaf)`, node = `keccak(0x01 || a || b)` | Different prefixes for leaves and inner nodes: defence in depth |
| Sorted pairs (smaller hash first) | Proofs become a plain list of siblings; no left/right flags needed |
| Odd node is promoted unchanged, never duplicated | Duplicating makes `[a,b,c]` and `[a,b,c,c]` share a root (a known Bitcoin flaw); a test guards this |

A consequence of sorted pairs, pinned by a test: swapping two leaves inside the
same pair does not change the root, but moving a leaf across pairs does.

## Mutation checks (we broke the code on purpose)
| Bug introduced | Result |
|----------------|--------|
| no sorting of the pair | 2 tests failed (every-leaf-verifies, order-within-pair) |
| unpaired node duplicated instead of promoted | 2 tests failed (every-leaf-verifies, odd-count-not-duplicate) |
| node prefix made equal to leaf prefix | 1 test failed: `test_two_leaves_root_follows_the_documented_formula` |

## Two things that went wrong, and what they taught
**1. A mutation that silently did nothing.** On the first try the third mutation
reported "18 passed". That looked like a gap in the tests, but `diff` showed the
file had not changed: my `sed` pattern never matched. My second attempt did
change the file, but wrote a raw NUL byte (`diff` said "Binary files differ")
and the test run printed nothing. The third attempt, `NODE_PREFIX = LEAF_PREFIX`,
applied cleanly. Lesson: a mutation check only counts after you have confirmed the
bug is really in the file.

**2. A test that claimed more than it proved.** With the mutation really in
place, the test I had named `test_an_internal_node_cannot_be_passed_off_as_a_leaf`
(which I said protected domain separation) still PASSED. Only the formula test
failed. Why: our leaves are always 32 bytes, so a leaf hash is computed over 33
bytes (`0x00` plus 32) while an inner node is computed over 65 (`0x01` plus two
32-byte hashes). Those inputs can never be equal, whatever the prefixes are. So:
- For fixed 32-byte leaves, the second-preimage attack is already impossible; the
  prefixes are defence in depth. They would matter if variable-length leaves were
  ever allowed.
- The prefixes are guarded by the formula test, which pins the exact bytes.
- I renamed the test to `test_an_internal_node_value_is_not_accepted_as_a_leaf`,
  added a comment explaining the above, and corrected the same overclaim in the
  Phase 6 plan.
This is exactly why we run mutation checks: they found a place where a test
name promised more than the test delivered.

## Concepts met in this step
Merkle tree, root, leaf, sibling, Merkle proof, inclusion proof, second-preimage
attack, domain separation, defence in depth. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: one blockchain transaction per record (what we have so far).
- Proper at scale: one transaction per batch, anchoring a Merkle root.
- Tradeoff (explored in Tasks 6.3 and 6.4): far less gas per record, but a record
  is no longer individually on-chain (a proof is needed), anchoring waits for a
  batch, and the "only the latest version is valid" rule is lost.

## What I should be able to explain after this
(Write this yourself: draw a 4-record tree, say which hashes you need to prove
record 3 is included, and why the proof is only about log2(N) hashes long.)
