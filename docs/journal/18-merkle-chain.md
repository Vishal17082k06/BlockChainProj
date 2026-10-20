# Step 18: Python talks to MerkleRegistry (and the cross-language check)

Date: 2026-10-05
Phase / Task: Phase 6, Task 6.3

## Goal
1. Let Python anchor Merkle roots and ask the contract to verify proofs.
2. Prove that Python and Solidity compute the SAME Merkle rules, so a proof built
   in one language is accepted by the other.
3. Write down, as a test, what batching gives up.

## What we did
Test first: wrote `tests/test_merkle_chain.py` (6 tests) and ran it with no
module in place (`No module named 'merkle_chain'`). Then:
- added `settings.merkle_deployment_file()` (env override `MERKLE_DEPLOYMENT_FILE`);
- wrote `python/merkle_chain.py`: class `MerkleChain` with `anchor_root`,
  `get_batch`, `batch_count`, `verify_on_chain`;
- added `merkle_chain` fixtures to `conftest.py` (snapshot before each test,
  revert after, like the earlier `chain` fixture).

`MerkleChain` is a **subclass of `Chain`**. It inherits connection handling, the
"node unreachable becomes `ChainUnavailable`" logic, and snapshot/revert, and
only supplies its own methods and its own deployment file. About 30 lines for a
whole new contract client.

## Output / evidence
```
Before:  ModuleNotFoundError: No module named 'merkle_chain'
After:   6 passed (this file);  whole Python suite 67 passed
         = 43 earlier + 18 Merkle + 6 here
```
With no `MerkleRegistry` deployment file, these tests SKIP with the message
"MerkleRegistry not available ... Run 'npx hardhat run scripts/deploy_merkle.js
--network localhost'" instead of failing.

## The cross-language test
`test_python_proofs_are_accepted_by_the_solidity_contract` builds trees in
Python for sizes 1, 2, 3, 7, 8 and 13, anchors each root with the contract, and
then asks the Solidity `verify` function to check EVERY leaf's Python-built
proof. All were accepted on the first run.

Why it matters: Python and Solidity are two separate implementations of one set
of rules (keccak, a `0x00` leaf prefix, a `0x01` node prefix, smaller hash first,
unpaired node promoted). If either one drifts, honest proofs get rejected. Sizes
1, 3, 7 and 13 are odd, which exercises the "promote the unpaired node" rule on
both sides. The JavaScript test in Step 17 was a first independent check; this is
the second and uses the real Python code.

## Mutation checks (each confirmed applied with `diff` first)
| Bug introduced | Tests that failed | What it shows |
|----------------|-------------------|---------------|
| Python node prefix `0x01` to `0x02` | formula test, cross-language test, and the limitation test (3 in all) | Python no longer matches Solidity, and the pure-Python formula test also pins the prefix |
| proof sent to the contract in reversed order | ONLY the cross-language test | every pure-Python test still passes, so only this test is wired to the real contract |
After restoring: 67 passed.

Correction to my own plan: it predicted that in the first mutation the
pure-Python tests "still pass". They do not: the formula test, which pins the
exact prefix bytes, fails too. That is a good thing (two independent guards), and
the plan now says so.

## The limitation, as a test
`test_old_batch_still_verifies_old_content__documented_limitation`:
1. Note 1 ("original text") is anchored in batch A.
2. The note is edited, and the new text is anchored in batch B.
3. The OLD text still verifies against batch A, and the contract says true.

In Step 07 our per-record contract only treated the LATEST version as valid, so a
rollback (restoring an old row) was caught. A batch is just a root: nothing on the
chain says which batch holds the newest version of a record. So with batching
alone, a rollback attack is NOT detected: an attacker who restores the old text
can still show a valid proof against the old batch.

What would be needed to get both savings and rollback protection (not built, for
the report's "future work"):
- keep a per-record "latest batch / sequence number" that is itself anchored,
  for example a small on-chain mapping updated per record (which reintroduces
  per-record storage cost), or
- include a sequence number in each leaf and anchor a second, smaller structure
  that commits to the latest sequence number of every record; or
- accept batching only for records that are never edited (append-only logs).
The honest framing for the viva: Merkle batching is cheaper per record but weaker
than per-record anchoring against rollback, so it fits write-once data best.

## Concepts met in this step
Cross-language (interoperability) test, subclassing to reuse a connection class,
rollback attack revisited, append-only data. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: a separate client class that duplicates `Chain`'s connection code.
- Proper: subclass `Chain` and override only what differs.
- Tradeoff: tiny coupling between the two classes, in exchange for no duplicated
  error handling (which already has a tested bug-fix history from Step 13).

## What I should be able to explain after this
(Write this yourself: why does Merkle batching lose the rollback defence, and for
what kind of data would you still choose it?)
