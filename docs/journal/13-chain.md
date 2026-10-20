# Step 13: Talking to the blockchain from Python

Date: 2026-10-05
Phase / Task: Phase 5, Task 5.2

## Goal
Write `chain.py`, the single file that talks to the blockchain, and prove with
tests that `web3` v8 can both send transactions and read data from our contract.

## Why this step exists
Until now Python could only read the contract (Step 08). The module has to
SEND transactions too: anchoring a hash and marking a record deleted. The PDF's
code was written for an older web3, and in Step 04 we noted that nobody knew yet
whether the newer v8 would behave the same. These tests are the first real
answer.

Keeping all blockchain code in one class has a second benefit: the rest of the
module never imports web3. Later, switching from the local node to Sepolia
(Phase 7) means changing only this file.

## Concepts: transaction vs call
- A **call** only reads. It runs on the node, returns a value instantly and
  costs nothing (`get_latest`).
- A **transaction** changes the chain. It must be signed by an account, mined
  into a block, and costs gas. We send it with `.transact(...)`, then wait for
  the **receipt**: the proof it was included in a block, containing the block
  number, the gas used and the events the contract emitted.
`anchor()` waits for the receipt because the receipt is where we learn the
version number (from the `HashAnchored` event) and the block number.

## What we did
Test first:
1. Wrote `tests/test_chain.py` (8 tests, see below) and ran it against the
   temporary stub: 7 errors (`Chain() takes no arguments`, no methods).
2. Replaced the stub with the real `python/chain.py`.
3. Result: 7 passed on the first run (the 8th test was added in step 5 below).

| Test | What it proves |
|------|----------------|
| anchor then get_latest | a hash sent from Python is stored and read back identically (bytes in, bytes out), version 1, timestamp set |
| reanchor creates version two | history grows and the latest hash changes |
| unknown record has version zero | the "never anchored" case is readable |
| mark_deleted | flag set, and further anchoring is rejected by the contract (`ContractLogicError`) |
| anchored_records from event logs | the id list can be rebuilt from `HashAnchored` events only (Python version of Step 11) |
| snapshot / revert | the chain can be rolled back, used to keep tests independent |
| connection lost after connecting | a node dying mid-session becomes `ChainUnavailable`, and the cached connection is dropped |
| unreachable node | a node that is not there at all becomes `ChainUnavailable` |

## How tests stay independent: snapshot and revert
The Hardhat node can take a snapshot of its whole state and later revert to it
(`evm_snapshot`, `evm_revert`). The `chain` fixture in `conftest.py` snapshots
before each test and reverts after, so every test starts from the same clean
chain without redeploying anything.

## Output / evidence
```
Stub:                      7 errors
Real chain.py:             7 passed (web3 8.0.0, Python 3.14.6)
After the extra test:      8 tests in this file; whole suite 23 passed (15 hashing + 8 chain)
Node state after tests:    versionCount note/1 = 0, block number 1 (clean)
No node running:           6 skipped with message "Local chain not available ... Start
                           'npx hardhat node' and deploy the contract", 1 passed
```

## web3 v8 compatibility result (the open question from Step 04)
Working: `transact` from `accounts[0]`, `wait_for_transaction_receipt`,
`process_receipt` (returns a tuple), `get_logs(from_block=0)`, `call()`, and the
snapshot RPC methods. Values to know: `bytes32` returns as Python `bytes`;
`getLatest` returns a list we unpack into a dict. No fix to the PDF's approach
was needed beyond using `from_block`.

## A gap the mutation check found in my own tests
We break the code on purpose to confirm tests catch bugs. Breaking the
`except OSError` branch changed nothing: all 7 tests still passed. Reason: a
node that is completely down is already caught earlier by `is_connected()`, so
that branch (which handles the node dying AFTER a successful connection) was
never exercised. We added `test_connection_lost_after_connecting_...`. With the
bug in place it fails; with the code restored it passes. Lesson: a passing test
suite only means something if you have seen the tests fail on a real bug.

## Design notes
1. **`ChainUnavailable` is one exception for "cannot reach the chain".** Callers
   (Task 5.3) turn it into the `UNAVAILABLE` status, never into `VERIFIED`.
2. **Other failures are NOT hidden.** A contract rejection (e.g. anchoring a
   deleted record) raises web3's `ContractLogicError` unchanged, because that is a
   real logic problem, not an availability problem.
3. **`connect()` checks that code exists at the contract address.** If the local
   chain was restarted (it forgets everything, Step 08) the address is empty and
   we say so with a clear message instead of a confusing decoding error.
4. **`transact({"from": accounts[0]})` only works on a development node,** whose
   first account is unlocked and is the contract owner. On Sepolia there are no
   unlocked accounts; Phase 7 replaces this with signing locally using a private
   key. That is why this code is isolated in one place.
5. **Connection is cached,** and dropped on any connection error so the next call
   reconnects.

## Concepts met in this step
Transaction vs call, receipt, event decoding, snapshot/revert, test fixture with
teardown, graceful skip. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: module-level functions with global web3 state (the PDF's version).
- Proper: a `Chain` class that is passed into functions.
- Tradeoff: a little more structure, but tests can pass in a deliberately dead
  chain to prove `UNAVAILABLE` handling, and Phase 7 can swap the signing logic
  without touching any other file.

## What I should be able to explain after this
(Write this yourself: what is the difference between a call and a transaction,
why does `anchor` wait for a receipt, and why is the chain object passed in
rather than imported globally?)
