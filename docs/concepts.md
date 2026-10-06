# Concepts

Plain-English definitions, added when we first meet each idea. Each entry says
where it came up (journal step) so you can find the context.

## Version control

- **Git branch**: a separate line of work. We use `feat/integrity-module` so
  `main` stays clean until the work is ready. (Step 01)
- **`.gitignore`**: a list of files git must never track. Secrets (`.env`),
  downloaded packages (`node_modules`) and generated files go here. (Step 01)

## Python tooling

- **Virtual environment (`.venv`)**: a private folder of installed Python
  packages for one project, so versions never clash with other projects.
  (Step 04)
- **Pinning dependencies**: writing exact versions (`web3==8.0.0`) in
  `requirements.txt` so the project installs identically on any machine, today
  or in a year. (Step 04)

## Node.js tooling

- **npm / `package.json` / `package-lock.json`**: npm downloads JavaScript
  packages. `package.json` lists what we asked for; `package-lock.json` records
  the exact version of everything installed, so installs are repeatable.
  (Step 05)
- **Hardhat**: a tool that compiles Solidity, runs contract tests, and starts a
  local blockchain with free test accounts. (Step 05)
- **Compiler / bytecode / ABI**: the compiler (`solc`) turns Solidity source into
  bytecode, the low-level program the blockchain runs, and an ABI, a JSON list
  of the contract's functions that lets Python or JavaScript call it. (Step 05)

## Testing

- **Test-driven development (TDD)**: write a failing test first, then write the
  minimum code to make it pass. Proves the test really checks something, and
  the tests describe the required behaviour. (Step 06)
- **Test fixture (`beforeEach`)**: setup that runs before every test, here
  deploying a fresh contract so tests cannot interfere with each other.
  (Step 06)
- **Revert**: when a contract rejects a transaction (e.g. "Not authorized"),
  all its changes are undone and the transaction fails. Tests check this with
  `revertedWith`. (Step 06)
- **`staticCall`**: runs a state-changing function as a read-only simulation to
  see what it would return, without sending a real transaction. (Step 06)

## Application setup

- **Environment variable / `.env` file**: settings (like the secret key) kept
  outside the source code. A `.env` file holds them locally and is never
  committed; `.env.example` is a safe template. Real environment variables take
  priority over the file. (Step 12)
- **Unicode normalisation (NFC)**: the same visible text can be stored as
  different bytes (é as one character, or e plus an accent). NFC picks one form
  so equal-looking text hashes equally. (Step 12)
- **Golden test**: a test that pins an exact expected output, here the exact
  canonical bytes of a sample record, so any accidental format change fails
  loudly. (Step 12)
- **Mutation check**: deliberately breaking the code to confirm a test fails.
  Proves the test really guards that behaviour. (Steps 07, 11, 12)

## Talking to the blockchain

- **Call vs transaction**: a call only reads data (free, instant). A transaction
  changes the chain: it is signed, mined into a block, and costs gas. (Step 13)
- **Receipt**: the proof a transaction was mined. Holds the block number, gas
  used and the events the contract emitted. We read the new version number from
  the receipt's event. (Step 13)
- **Snapshot / revert**: the dev node can save its whole state and later roll
  back to it. We use it so every test starts from a clean chain. (Step 13)
- **Dependency injection (passing the chain in)**: giving a function the object
  it needs instead of letting it import one globally, so tests can pass a fake or
  dead one. (Step 13)

## Integrity design

- **Anchoring**: computing a record's keyed hash and writing it to the
  blockchain so the record can be checked later. (Step 14)
- **Verification statuses**: `VERIFIED`, `TAMPERED`, `MISSING_FROM_DB`,
  `DELETED_AUTHORIZED`, `NOT_ANCHORED`, `INCONSISTENT`, `UNAVAILABLE`. Each
  describes a different relationship between the database row and the chain.
  (Step 14)
- **Source of truth**: the one place a disagreement is settled. Here it is the
  chain; the local `integrity_log` is only a convenience copy. (Step 14)
- **Fail-open vs fail-closed**: when something breaks, either carry on anyway
  (fail-open) or refuse (fail-closed). We fail open on create (record is saved,
  shows NOT_ANCHORED) and closed on update and delete (to avoid false alarms and
  hidden changes). (Step 14)
- **Verify-before-update guard**: refuse to edit a record that already fails its
  check, otherwise re-anchoring would bless forged content. (Step 14)
- **Rollback attack**: restoring an old, previously valid version of a row. Caught
  because only the latest chain version counts. (Steps 07, 14)
- **False positive**: reporting `TAMPERED` for a record nobody tampered with. We
  design to avoid these. (Step 14)
- **SQL parameterisation / whitelisting**: values go through `?` placeholders and
  table/column names come only from a fixed list, so user input can never alter
  the SQL. (Step 14)

## Demo and transactions

- **Nonce (of an account)**: a counter of how many transactions an account has
  sent. It is part of what a transaction hash is computed from, so rolling the
  chain back and repeating the same action gives the same hash. (Step 15)
- **End-to-end demo**: one script that exercises the whole system the way a user
  or attacker would, from creating a record to detecting each kind of tampering.
  (Step 15)

## Blockchain basics (filled in from Phase 1 onward)

- **Hash function**: takes any input and produces a fixed-size output (SHA-256:
  64 hex characters = 32 bytes). Same input always gives the same output; you
  cannot practically work backwards from output to input. (Step 02)
- **Avalanche effect**: changing one character of the input changes almost the
  whole hash (61 of 64 characters in our demo). This is why even tiny silent
  edits are detectable. (Step 02)
- **HMAC (keyed hash)**: a hash that also mixes in a secret key. Without the
  key nobody can reproduce it, so guessing short or predictable content from a
  published hash fails. Our module stores HMACs on-chain. (Step 02)
- **Canonicalisation**: converting a record into one exact, unambiguous text
  form before hashing (sorted keys, no extra spaces, fixed formats), so the same
  record always gives the same bytes and different records never collide by
  accident, e.g. (1,"23") vs (12,"3"). (Step 02)
- **Block / chain**: a block bundles some data with the hash of the previous
  block. Because each block depends on the one before, changing an old block
  breaks every later link, so history is tamper-evident. (Step 03)
- **Nonce / proof-of-work**: a nonce is a number a miner keeps changing until
  the block's hash meets a rule (e.g. starts with four zeros). It makes creating
  a block costly, so rewriting many blocks is costly too. (Step 03)
- **Node / consensus**: a node is one computer holding a copy of the chain.
  Consensus is the shared rule set nodes use to agree on which chain is valid.
  Many independent nodes are what stop a single party rewriting history; one
  local node gives no such protection. (Step 03)
- **Smart contract**: a program stored on the blockchain. Its code and data are
  public, it runs exactly as written when someone calls a function, and each
  call is a recorded transaction. Ours is a tamper-evident registry of hashes.
  (Step 07)
- **Solidity building blocks** (Step 07):
  - *state variable*: data the contract stores permanently on-chain.
  - *struct*: a bundle of fields, like a row.
  - *mapping*: a lookup table, like a Python dict.
  - *modifier*: reusable check run before a function (e.g. `onlyOwner`).
  - *`msg.sender`*: the account that sent the current transaction.
  - *`require`*: reverts (undoes) the transaction if a condition is false.
  - *`view` function*: only reads, so calling it is free.
  - *`calldata` vs `memory`*: read-only input data (cheaper) vs a modifiable copy.
  - *`bytes32`*: a fixed 32-byte value; exactly the size of a SHA-256/HMAC hash.
  - *`keccak256`*: Ethereum's hash function.
- **Event**: a log entry a contract writes into a transaction receipt. Much
  cheaper than storage and searchable later. Contracts cannot read events back;
  programs outside the chain can. (Step 07, Step 11)
- **Event log query (`queryFilter`)**: asking the chain for all events of one
  kind, here every `HashAnchored`, to rebuild history without any database.
  (Step 11)
- **Indexer**: a service that copies chain events into a database for fast
  searching. Scanning all events directly is fine for a prototype but slow at
  scale. (Step 11)
- **Local node**: a blockchain running on your own computer
  (`npx hardhat node`, at `http://127.0.0.1:8545`). Free, fast, in memory,
  erased when stopped. (Step 08)
- **Account / private key**: an account is an address that can send
  transactions. Its private key signs them, proving they are yours. Hardhat's
  20 test accounts have publicly known keys and fake ETH; never use them on a
  real network. (Step 08)
- **Transaction / block**: a transaction is a signed instruction that changes
  the chain (including deploying a contract). Transactions are recorded in
  blocks. (Step 08)
- **Contract address**: where a deployed contract lives. Derived from the
  deployer's address and transaction count, so it is predictable, not random.
  (Step 08)
- **Chain id**: a number identifying a network (31337 for Hardhat's local
  chain), so transactions for one network cannot be replayed on another.
  (Step 08)
- **ABI**: a JSON description of a contract's functions. With the address, it
  lets Python or JavaScript call the contract. Saved with the address in
  `deployment.json`. (Step 08)
- **Off-chain vs on-chain computation**: work done in our own program (cheap,
  free) vs work done by the contract (every step costs gas). Moving work
  off-chain, such as computing the record key in Python, reduces cost. (Step 09)
- **Indexed event field**: marks a field as a searchable "topic" so programs can
  filter events by it. Indexed strings are stored only as their hash, so they
  can't be read back; indexed `bytes32` values can be matched exactly.
  (Step 09)
- **Gas**: the unit that measures the work a transaction makes the network do.
  Cost in money = gas used x gas price. Writing a new storage slot is by far the
  most expensive operation (about 22,100 gas each); every transaction also has a
  21,000 base cost; reading off-chain is free. Our first anchor uses about
  96-99k gas, mostly storage. (Step 10)
- **Merkle tree**: a tree of hashes. Hash each record, hash pairs together, repeat
  until one **root** hash remains. Anchoring only the root commits to every record
  in a single transaction. (Step 16)
- **Merkle proof (inclusion proof)**: the few "sibling" hashes along one leaf's
  path to the root. Recomputing upward and matching the root proves that record was
  in the batch, without revealing the others. About log2(N) hashes long. (Step 16)
- **Second-preimage attack (on a Merkle tree)**: passing an internal node off as a
  leaf. Defended by hashing leaves and nodes differently (prefixes) and by fixing
  leaf size. (Step 16)
- **Gas amortisation / break-even**: spreading one fixed transaction cost over N
  records. A Merkle root cost about 115.8k gas whatever N; per-record anchoring
  cost about 98.7k each. So batching loses at N = 1 and wins from about N = 2
  upward, saving 88% at N = 10 and 98.8% at N = 100. (Step 19)
- **Cross-language (interoperability) test**: a test where code in one language
  produces a value and code in another checks it, here Python-built Merkle proofs
  accepted by the Solidity contract. Catches the two implementations drifting
  apart. (Step 18)
- **Batching vs rollback protection**: anchoring a Merkle root per batch is cheap
  per record, but a batch has no "latest version" rule, so an old record version
  still verifies against its old batch. Best suited to write-once data. (Step 18)
- **Private key / address / signing**: a private key is a secret number that
  controls an account; the address is the public name derived from it. Signing a
  transaction with the key proves the owner approved it, without revealing the key.
  On a real network we must sign ourselves; our local node signs for us. (Step 20)
- **Chain id**: a number identifying a network (1 = Ethereum mainnet, 11155111 =
  Sepolia, 31337 = local Hardhat). Included in signed transactions so they cannot
  be replayed on another network; we also check it before signing. (Step 20)
- **Allow-list guardrail**: refusing everything except a short list of approved
  options, here networks we are willing to sign on. (Step 20)
- **Event log range limit / chunking**: public servers cap how many blocks one
  event query may cover, so we start at the deployment block and ask in chunks.
  (Step 20)
- **Hardfork / gas schedule**: a network upgrade that can change what operations
  cost. Sepolia's Glamsterdam upgrade (2026-10-06) made creating permanent data far
  more expensive (new storage slot about 97,920 gas, contract code 1,530 per byte).
  Gas numbers from a local test chain only hold for the rules that chain uses.
  (Step 21)
- **Dry run / estimated gas**: asking the network what an action WOULD cost without
  sending it. Our deploy script prints this and only sends when
  `CONFIRM_DEPLOY=yes`. (Step 21)
- **Contract metadata hash**: a small blob Solidity appends to compiled code, holding
  a hash that depends on the source file's name and path. Two identical contracts can
  differ only there, so comparisons strip it first. (Step 22)
- **Reproducible build**: compiling the same source with the same compiler version and
  settings (EVM version, optimizer) gives byte-identical code. This is what lets us
  prove a deployed contract is ours. (Step 22)
- **Deployment verification**: checking the code at an address, the transaction that
  created it, the network and the owner before trusting it, instead of trusting
  whatever address someone provides. (Step 22)
- **Defence in depth**: layering protections so no single one is the only thing
  holding the line. The leaf/node prefixes are one: fixed 32-byte leaves already
  block the attack, and the prefixes cover the case where that changes. (Step 16)
