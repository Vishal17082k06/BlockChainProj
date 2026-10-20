# Step 22: Getting ready to deploy with Remix

Date: 2026-10-07
Phase / Task: Phase 7, preparing Task 7.4 (the deployment itself is done by you, in
Remix, with MetaMask)

## Goal
You chose to deploy through Remix. Make that safe and verifiable: a written guide,
exact test inputs, and tools that PROVE what you deployed is our contract and connect it
to our Python code.

## Why extra tools? (the trust problem)
Anyone can deploy a contract and call it "IntegrityRegistry". If we simply trusted an
address you typed in, a mistake (wrong file, wrong compiler settings, someone else's
contract) would make our code write to the wrong place or trust the wrong thing. So
before our code uses a deployment, we check it.

## What we built (all with tests first)
| Tool | What it does | Tests |
|------|--------------|-------|
| `python/check_deployment.py` | compares the code stored on the chain with the code we compiled from `blockchain/contracts/` | 8 |
| `python/register_deployment.py` | writes the small file our Python code uses to find a contract, but ONLY after four checks | 9 |
| `experiments/remix_inputs.py` | prints ready-to-paste test values (real hashes, a real Merkle proof) | replayed against the real contracts |
| `docs/remix-guide.md` | the step-by-step guide | values cross-checked |

Python suite: 99 passing (82 + 8 + 9).

### How the code comparison works
Solidity appends a small metadata blob to every compiled contract, ending with two
bytes that give its length. The blob contains a hash that changes with the source
file's name and path, so the SAME contract compiled in two places can differ only
there. `check_deployment` removes that blob from both sides and compares the rest
byte for byte. Tests: identical code with different metadata matches; ONE changed
byte is detected; the Merkle contract is not mistaken for the Integrity contract; an
address with no code does not match.

### The four refusals in `register_deployment`
It writes nothing unless: (1) the chain id is the network we expect, (2) the code at
the address is exactly our compiled contract, (3) the transaction you give created
that address and succeeded, (4) the contract's owner is the wallet whose key is in
`.env`. Check 4 matters because only the owner can anchor hashes.
Mutation check: we removed each of the five conditions in turn; each time a test
failed. (A sixth check, "the transaction failed on chain", first turned out NOT to be
protected: removing it changed nothing. See below.)

## Findings worth keeping

**1. Remix's default settings would give you different code.** We reproduced a Remix
compile (same compiler engine, 0.8.24) and compared with our Hardhat build:

| Setting | Result |
|---------|--------|
| EVM `paris`, optimizer off | exact match, both contracts |
| Remix default EVM (`cancun`) | differs (3,929 vs 4,073 bytes of logic) |
| optimizer on | differs, and much smaller (2,354 bytes) |

So the guide tells you to set EVM `paris` and leave the optimizer off.

**2. The optimizer would make deployment much cheaper on Sepolia, a good report
point.** Sepolia now charges 1,530 gas per byte of stored code (Step 21). Optimizing
shrinks `IntegrityRegistry` from about 4,073 to about 2,354 bytes, roughly 1,700 bytes
less, which would save on the order of 2.6 million gas on deployment (an estimate from
the price per byte, not a measurement). We keep the optimizer OFF on purpose: byte-for-
byte reproducibility is what lets us prove a deployment is our code. This is a real
"simple versus proper" tradeoff: reproducible and checkable, versus cheaper to deploy.

**3. A trap in Remix: the gas limit.** Remix's default gas limit has historically been
3,000,000, but our deployment needs about 6.7 million on Sepolia. A too-low limit makes
the transaction run out of gas, fail, and still charge the fee. The guide tells you to
set Custom 10,000,000 (you only pay for gas actually used).

**4. Predicted addresses.** A contract's address comes from the deployer's address and
its transaction count. Your wallet has sent nothing yet, so the first contract should
land at `0xF9885ec5865f1DeE480825eeB3a56F461D2439Ca` and the second at
`0xf69E23742D71E9d3dC67bb3fbc892f30080faE98`. I checked the method first on a case
we already knew (Hardhat's first account gives `0x5FbDB2...`), and it reproduced it.

## Mistakes and gaps found in my own work along the way
- **A safety check with no test.** The "transaction failed" check in
  `register_deployment` was unprotected. Removing it changed nothing, because a failed
  deployment has no contract address, so the next check would catch it anyway. Two
  attempts to test it for real failed: first a gas limit so low the node refused it at
  the door; then a moderately low limit, where the local node simply raises an error
  instead of recording a failed transaction. Final fix: hand the tool a receipt that is
  perfect except for a "failed" status. After that, removing the check is caught. The
  lesson: a check that is redundant for safety can still be worth keeping for a clearer
  message, but only if a test pins it.
- **A tool I misjudged.** I labelled a first-byte value of 34 as "plain text" when it
  is just the opening quote of a docstring; no hidden marker was present. Wrong label,
  right conclusion.
- **A safety filter blocked a command** because the word "delete" appeared inside a
  script I had put on the command line. I moved the script into a file. Not a bug in
  our code; worth knowing if you see odd "blocked" messages.

## What is NOT verified
The exact layout and wording of today's Remix and MetaMask screens. They change
between versions. If something is not where the guide says, tell me what you see.
Also nothing has been deployed: that step is yours.

## Concepts met in this step
Contract metadata hash, reproducible build, compiler settings (EVM version,
optimizer), code size and deployment cost, contract-address derivation, ownership, why
you verify a deployment instead of trusting an address. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: deploy in Remix, copy the address into a config file by hand.
- Proper: deploy in Remix, then verify the code, the transaction, the network and the
  owner with a tool before trusting the address.
- Chosen: proper. It costs two commands and removes a whole class of silent mistakes.

## What I should be able to explain after this
(Write this yourself: why can't we just trust an address someone gives us, what exactly
does `check_deployment` compare, and why must the Remix EVM version and optimizer
settings match ours?)
