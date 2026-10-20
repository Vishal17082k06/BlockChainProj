# Step 06: Contract tests (written first, failing)

Date: 2026-10-05
Phase / Task: Phase 3, Task 3.1

## Goal
Write down, as automated tests, exactly how the `IntegrityRegistry` contract
must behave, before the contract exists.

## Why this step exists (test-driven development)
Writing tests first forces us to decide what "correct" means before we write
code. It also gives a safety check: a test you have never seen fail might be
passing for the wrong reason (for example, testing nothing). Seeing it fail
first, then pass after we write the code, proves the test really depends on the
code.

A smart contract is a special case where this matters even more. Once a
contract is deployed on a real network it cannot be edited, so bugs are
permanent. Tests are our only chance to catch them.

## What we did
Created `blockchain/test/IntegrityRegistry.test.js` with 17 tests in five groups:

| Group | Tests | What it protects |
|-------|-------|------------------|
| anchoring and verifying | 5 | store a hash, match it, reject others, keep record types and ids separate, return the version |
| versioning | 4 | history kept, old version no longer valid (rollback defence), unknown record gives zeros |
| events | 2 | `HashAnchored` and `RecordMarkedDeleted` are emitted with the right data |
| deletion | 3 | no anchoring after deletion, deleted records fail verification, cannot delete what was never anchored |
| access control | 3 | only the owner writes; anyone reads |

Test structure: `beforeEach` deploys a fresh contract before every test, so
tests cannot affect each other. `owner` is the first test account (the
deployer); `other` is a second account used to prove non-owners are rejected.
`anyValue` is used where a value (the block timestamp) is not predictable.

## Output / evidence
```
$ npx hardhat test
  IntegrityRegistry
    anchoring and verifying
      1) "before each" hook for "anchors a hash and verifies it"

  0 passing (3s)
  1 failing

  HardhatError: HH700: Artifact for contract "IntegrityRegistry" not found.
```
This is the correct failure. "Artifact not found" means Hardhat found no
compiled `IntegrityRegistry` contract, which is exactly true.

Detail worth knowing: the report says "1 failing" rather than 17. The
deployment happens in `beforeEach`, which failed, so Mocha (the test runner)
stops and does not run the 17 tests individually. We will see the real count of
17 once the contract exists.

## Concepts met in this step
Test-driven development, test fixture (`beforeEach`), `revertedWith` (a
transaction that the contract rejects), test accounts (signers), `staticCall`
(run a function to see its return value without sending a transaction).
(See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: write the contract, then try it by hand or with a few tests.
- Proper: write the full behaviour as tests first (TDD).
- Chosen: tests first, since contracts are immutable once deployed and the
  tests double as a readable specification you can point to in the viva.

## What I should be able to explain after this
(Write this yourself: why did we want these tests to fail first, and why does
testing matter more for a smart contract than for ordinary code?)
