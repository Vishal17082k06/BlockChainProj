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
- Merkle tree: (to be defined in Phase 6)
