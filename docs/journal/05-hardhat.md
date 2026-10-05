# Step 05: Hardhat setup

Date: 2026-10-05
Phase / Task: Phase 2, Task 2.2

## Goal
Install Hardhat 2 in `blockchain/` and prove it can compile Solidity.

## Why this step exists
Hardhat is our all-in-one blockchain development tool. It does three jobs:
1. **Compile** Solidity source into bytecode (what the blockchain runs) and an
   ABI (the list of functions, so Python/JavaScript can call the contract).
2. **Test** contracts using JavaScript test files.
3. **Run a local blockchain** (`npx hardhat node`) with pre-funded test
   accounts, so nothing costs real money.

## What we did
```
mkdir blockchain && cd blockchain
npm init -y
npm install --save-dev hardhat@2 @nomicfoundation/hardhat-toolbox
npm install --save-dev "@nomicfoundation/hardhat-toolbox@hh2"   # fix, see below
```
Wrote `blockchain/hardhat.config.js` by hand (compiler 0.8.24, a `localhost`
network at `http://127.0.0.1:8545`). We skipped `npx hardhat init` because it is
an interactive wizard, and writing the config ourselves shows exactly what it
contains.

Blast radius: npm downloaded 224 packages into `blockchain/node_modules` (ignored
by git) and Hardhat downloaded the Solidity compiler into a user cache. No
credentials, no services started, nothing outside this project changed except
that cache.

## Output / evidence
```
npx hardhat --version                -> 2.29.1
npx hardhat compile (Throwaway.sol)  -> Downloading compiler 0.8.24
                                        Compiled 1 Solidity file successfully (evm target: paris)
npx hardhat compile (no contracts)   -> Nothing to compile
```
The Throwaway contract was only a 3-line file to exercise the compiler. It was
deleted afterwards, along with the generated `artifacts/` and `cache/`.

## Problems met and how we solved them
1. **Wrong toolbox version.** `npm install @nomicfoundation/hardhat-toolbox`
   gets the `latest` tag, which is built for Hardhat 3 and refuses to work with
   Hardhat 2. Hardhat printed the fix: install the `hh2` tag. This is exactly the
   "check version-specific details" warning in the PDF's references. We
   recorded the resolved version (`^6.1.2` with `hardhat ^2.29.1`) in
   `package.json`; `package-lock.json` pins the exact versions of everything.
2. **"19 vulnerabilities" warning from npm.** We did not run
   `npm audit fix --force`. That command can upgrade packages across major
   versions and break the toolchain. These packages are development tooling
   inside Hardhat's dependency tree; none ship in our project or run on a
   server. Fine for a local prototype; worth one sentence in the report.

## Concepts met in this step
Compiler, bytecode, ABI, npm and `package.json`/`package-lock.json`
(added to `docs/concepts.md`).

## Simple vs "proper" choice
- Simple: use `npx hardhat init` and accept the sample project.
- Proper: hand-write the minimal config and add only the files we need.
- Chosen: hand-written. The sample project adds files we would delete, and
  writing the config is how you learn what each setting does.

## What I should be able to explain after this
(Write this yourself: what are the three jobs Hardhat does for us, and what is
the ABI for?)
