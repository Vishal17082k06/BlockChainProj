# Step 09: The bytes32-key variant (for the gas comparison)

Date: 2026-10-05
Phase / Task: Phase 4, Task 4.1

## Goal
Build a second version of the contract, with the same behaviour, that takes a
ready-made 32-byte record key instead of a string plus an id. We do this so the
gas comparison in the next step uses two real contracts, not a guess.

## Why this step exists
Our main contract is called like `anchorHash("note", 7, hash)`. Each call sends
the string `"note"` to the blockchain, and the contract hashes it together with
the id on-chain (`keccak256(abi.encode(recordType, recordId))`) to find the
record. Sending text and hashing it on-chain costs gas, and on a real network gas
costs money.

The variant moves that work off-chain: our Python code computes the same
`keccak256(abi.encode(type, id))` itself and sends only the 32-byte result:
`anchorHash(key, hash)`. The contract then does less work per call. Whether it
is meaningfully cheaper is something we measure in Step 10, not assume.

## What we did
Test first, as before:
1. Wrote `blockchain/test/IntegrityRegistryBytes32.test.js` (4 tests: anchor and
   verify; only the latest version is valid; deletion blocks anchoring and fails
   verification; non-owner writes and unanchored deletes are rejected).
2. Ran it: `HH700: Artifact for contract "IntegrityRegistryBytes32" not found`
   (expected, nothing to test yet).
3. Wrote `blockchain/contracts/experimental/IntegrityRegistryBytes32.sol`.
4. Ran the whole suite.

The key convention is the same formula the main contract uses internally:
`key = keccak256(abi.encode(recordType, recordId))`. The test helper
`recordKey(type, id)` reproduces it in JavaScript with ethers. This matters
later: Python must produce the identical value.

## Output / evidence
```
Before the contract existed:   0 passing, 1 failing (HH700 artifact not found)
After:                         21 passing   (17 original + 4 new)
git status on contracts/:      only the new experimental/ folder; the production
                               IntegrityRegistry.sol is unchanged
```

## One difference worth noticing
In the variant the events use `bytes32 indexed key`. An **indexed** event field
is stored as a searchable "topic", so a program can ask the chain "give me only
events for this record" without scanning everything. The main contract's events
carry the readable strings (`recordType`) un-indexed instead, because an indexed
string is stored only as its hash and could not be read back. So the variant
gains cheap per-record searching but loses the human-readable type in the event.
We return to this in Step 11.

## Concepts met in this step
Off-chain vs on-chain computation, calldata cost, indexed event field.
(See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: pass a readable `string` type and id (the PDF's design). Easy to read
  and debug; every event shows what record it concerns.
- Proper/cheaper (to be confirmed by measurement): pass a precomputed `bytes32`.
- Tradeoff: the variant is likely cheaper but less readable on a block explorer,
  and every caller must compute the key the same way. Decision deferred to
  Step 10, when we have numbers.

## What I should be able to explain after this
(Write this yourself: why might passing a precomputed 32-byte key be cheaper
than passing a string, and what do we lose by doing it?)
