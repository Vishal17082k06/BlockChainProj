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
- Smart contract:
- Gas:
- ABI:
- Event:
- Merkle tree:
