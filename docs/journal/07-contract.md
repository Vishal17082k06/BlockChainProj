# Step 07: The IntegrityRegistry contract

Date: 2026-10-05
Phase / Task: Phase 3, Task 3.2

## Goal
Write the smart contract so that all 17 tests from Step 06 pass.

## What we did
Created `blockchain/contracts/IntegrityRegistry.sol` (about 90 lines, following
PDF 8.4) and ran `npx hardhat test`.

## Output / evidence
```
Compiled 1 Solidity file successfully (evm target: paris).
  17 passing (2s)
```
Mutation check (does a test notice a bug?): we temporarily changed `verify` to
compare against the FIRST version (`versions[k][0]`) instead of the latest
(`versions[k][n - 1]`). Result: `16 passing, 1 failing`, and the failing test was
"keeps history when a record is re-anchored". We then restored the contract and
got `17 passing` again. So the rollback-defence behaviour is genuinely guarded
by a test.

## The contract, line by line

**Storage (the contract's permanent memory on the blockchain)**
- `address public owner;` the account that deployed the contract. `public`
  makes Solidity create a read function `owner()` automatically.
- `struct Version { bytes32 hash; uint256 timestamp; }` one stored fingerprint:
  the 32-byte hash and the time it was anchored. A `struct` groups fields
  together, like a row.
- `mapping(bytes32 => Version[]) private versions;` a lookup table: record
  identity in, list of versions out. Think of a Python dict of lists. Because we
  only ever `push` onto the list and never remove, history is append-only.
- `mapping(bytes32 => bool) private deleted;` records that were legitimately
  marked as deleted. `private` only hides it from other contracts; all data on a
  blockchain is publicly readable by anyone who looks at the chain.

**Events**
- `event HashAnchored(...)` and `event RecordMarkedDeleted(...)`: log entries
  the contract writes into the transaction receipt. They are much cheaper than
  storage and can be searched later (we use this in Phase 4).

**Access control**
- `modifier onlyOwner` runs `require(msg.sender == owner, "Not authorized")`
  before the function body (`_;` marks where the body runs). `msg.sender` is
  the account that sent the transaction. `require(...)` reverts (undoes) the
  whole transaction with the message if the condition is false.
- `constructor()` runs once at deployment and sets `owner = msg.sender`.

**The record identity**
- `_key(recordType, recordId)` returns `keccak256(abi.encode(recordType, recordId))`.
  Keccak-256 is Ethereum's hash function. `abi.encode` pads each value to a fixed
  size, which avoids the same ambiguity problem we saw in Step 02 (so
  `("note", 12)` can never collide with `("note1", 2)`).

**Functions that write (cost gas, owner only)**
- `anchorHash(type, id, hash)`: refuses if the record was marked deleted,
  appends a new `Version`, emits `HashAnchored`, and returns the new version
  number.
- `markDeleted(type, id)`: refuses if nothing was ever anchored, then sets the
  deleted flag and emits `RecordMarkedDeleted`.

**Functions that only read (`view`, free to call)**
- `getLatest`: latest hash, version number, timestamp and deleted flag; returns
  zeros for an unknown record.
- `verify(type, id, currentHash)`: true only if the record exists, is not
  deleted, and `currentHash` equals the LAST stored hash. Comparing against the
  last one only is why restoring an old valid version still counts as tampering.
- `versionCount` and `getVersion(index)`: let anyone walk the whole history.

**`calldata` vs `memory`**: both mean "temporary data". `calldata` is read-only
data passed in by the caller and is cheaper because nothing is copied. `memory`
is a modifiable copy. External functions take `string calldata` for gas
efficiency; the internal `_key` takes `string memory`, and Solidity copies
automatically when needed.

## Concepts met in this step
Smart contract, state variable, struct, mapping, modifier, `msg.sender`,
`require`/revert, event/`emit`, `view` function, `calldata` vs `memory`,
`keccak256`, `bytes32`. (Added to `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple (the PDF's design, which we built): identify a record by a `string`
  type and numeric id, passed in on every call.
- Proper/cheaper: compute the key off-chain and pass a `bytes32`, avoiding
  string passing and encoding on-chain.
- Chosen for now: the PDF's readable version. Phase 4 measures the gas of both
  so we pick based on evidence, not guessing.

## Honest limitations to keep in mind
- A single `owner` is a single point of trust (PDF 10). Whoever holds that key
  can append hashes for any record.
- Everything on a public chain, including "private" mappings, is readable. We are
  safe only because we store keyed hashes, not data.

## What I should be able to explain after this
(Write this yourself: why do we only trust the LAST version in `verify`, and
what stops an ordinary user from writing to the contract?)
