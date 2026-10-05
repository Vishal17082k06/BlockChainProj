# Blockchain Integrity Module: Master Plan (simplified, blockchain-first)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor a keyed hash of a database record on a blockchain, and later verify from the database whether the record was tampered with.

**Architecture:** A small Solidity contract (`IntegrityRegistry`) on a local Hardhat chain stores an append-only list of 32-byte HMAC hashes per record. Plain Python scripts hash a database row, anchor it, and on request recompute and compare. No web server, no UI: a command-line demo is enough.

**Tech Stack:** Solidity 0.8.x, Hardhat 2 (Node.js), Python 3.10+, web3.py, SQLite (Python built-in), pytest.

**Spec:** `Blockchain_Data_Integrity_Verification_Report.pdf` (v1.0). "PDF 7.2" means section 7.2 of it.

## Global Constraints

- On-chain data is only: record type, record id, 32-byte keyed hash, version, timestamp. No personal data (PDF 5).
- Hash = HMAC-SHA256 over canonical JSON: sorted keys, separators `(",", ":")`, Unicode NFC, UTC timestamps, `null` for missing, record type and schema version inside the payload (PDF 7.2, 7.3).
- Secret key lives in the `INTEGRITY_SECRET_KEY` env var, never in the DB, chain, or git.
- Only the latest on-chain version is valid (blocks rollback attacks, PDF 7.4).
- Verification when the chain is unreachable returns `UNAVAILABLE`, never `VERIFIED`.
- SQL table and column names come from a whitelist, never from user input.
- Hardhat 2, CommonJS style. Everything local until the testnet phase.

## What we deliberately cut (and why)

| Cut | Reason |
|-----|--------|
| FastAPI server, routes, auth | Plumbing. A CLI demo shows the same behaviour. |
| React badge | No blockchain learning. |
| PostgreSQL | SQLite ships with Python, zero setup. Swapping to Postgres later is only a connection change. Tamper demo uses the `sqlite3` command line. |
| `pending_anchor` retry queue, `verification_history` table | Nice engineering, not blockchain. Written up as limitations/future work in the report. |
| Multiple record types | We protect `note` only; `RECORD_SPECS` is a dict so adding `calendarevent` is one entry. |
| Batch anchoring and ownership transfer | Merkle batching (Phase 6) covers the batching idea. Ownership transfer is mentioned in the report only. |

## How we work

1. **One journal entry per task** in `docs/journal/NN-title.md` (template: `_TEMPLATE.md`). You write the "what I should be able to explain" section in your own words.
2. **Concepts defined when first met**, collected in `docs/concepts.md`.
3. **TDD** for the contract (Hardhat tests) and for hashing/verification (pytest): failing test first.
4. **Verification before "done":** every task has a command and expected result; we run it and paste real output into the journal.
5. **Simple vs "proper":** recorded in the journal whenever there is a choice.
6. **Per-phase detailed plans:** before each phase I write a bite-sized TDD plan with full code for that phase only.
7. **Git:** branch `feat/integrity-module`, one commit per task.

## Blast radius flag

Phases 0-6 are fully local (throwaway test accounts, local SQLite, self-generated secret). Phase 7 (testnet) is the only step using a real wallet key; we will stop and explain it first. Use a brand-new wallet holding only free test tokens, key in a gitignored `.env`.

## Known issues in the PDF's code, to fix while building

1. Column names disagree between PDF tables and code (`title` vs `eventtitle`, `noteid` vs `note_id`). We define the schema first and match it.
2. `.env` is never loaded (`os.environ[...]` with no `load_dotenv()`). We load it explicitly.
3. `DEPLOYMENT_FILE` is a relative path that depends on the working directory. We resolve it from the project root.
4. Restarting the in-memory Hardhat node resets versions and collides with old `integrity_log` rows. We use `evm_snapshot` / `evm_revert` in tests and document a reset step for demos.
5. `transact({"from": accounts[0]})` only works on a dev node. We isolate it in `chain.py` so a testnet signer can replace it.
6. `verify-all` finds ids through `integrity_log`, which lives in the attacker's database. We rebuild the id list from chain events instead (Task 4.2).
7. web3.py v6/v7 API differences. We pin the version.

---

## File structure (target)

```
BlockChainProj/   (repository root)
  docs/        00-master-plan.md, concepts.md, journal/NN-*.md   (documentation only)
  experiments/ hash_demo.py, toy_chain.py                        (learning scripts)
  blockchain/
    contracts/IntegrityRegistry.sol
    test/IntegrityRegistry.test.js
    scripts/deploy.js, list_anchors.js
    hardhat.config.js
    deployment.json            (generated, gitignored)
  python/
    requirements.txt, .env.example
    hashing.py                 (canonical JSON + HMAC)
    chain.py                   (web3 access)
    integrity.py               (anchor, verify)
    db.py                      (SQLite setup)
    merkle.py
    demo.py                    (CLI demo)
    tests/test_hashing.py, test_integrity.py, test_merkle.py
```

---

## Phases and tasks

### Phase 0: Scaffold
- [x] **0.1** Folder, README, journal template, this plan.
- [x] **0.2** `docs/concepts.md` skeleton, `.gitignore` (`.env`, `node_modules`, `deployment.json`, `__pycache__`, `.venv`, `*.db`), journal `01-setup.md`, create branch, commit.
  - Verify: `git status` clean; `.env` ignored.

### Phase 1: Understand blockchain by building one
- [x] **1.1** `experiments/hash_demo.py`: SHA-256 of the PDF's two doctor-appointment strings (expect 61 of 64 hex chars differ), HMAC with a key, and the join-without-separator collision `(1,"23")` vs `(12,"3")`.
  - Verify: hashes match the PDF's printed values.
  - Learn: hash, avalanche, HMAC, canonicalisation.
- [x] **1.2** `experiments/toy_chain.py`: ~60-line blockchain (index, data, previous hash, simple proof-of-work). Tamper with block 2; `is_valid()` must fail at the broken link.
  - Verify: valid chain returns True; after tampering, the report names the broken block.
  - Learn: chaining, tamper evidence, what nodes and consensus add (PDF 3.3, 3.4), why one local node proves little (PDF 10).

### Phase 2: Toolchain
- [x] **2.1** Check/install Node LTS, Python 3.10+, git. Create `python/.venv`. Record versions.
  - Verify: `node -v`, `python --version`.
- [x] **2.2** In `blockchain/`: `npm init -y`, `npm install --save-dev hardhat@2`, `npx hardhat init` (JavaScript), delete samples.
  - Verify: `npx hardhat compile` succeeds on the empty project.
  - Learn: what Hardhat is (compiler + test runner + local chain).

### Phase 3: Smart contract (TDD, the heart of the project)
- [ ] **3.1** Write the tests first: the PDF's five (8.5) plus: `getLatest` on unknown record returns zeros; `markDeleted` with nothing anchored reverts; `getVersion` returns history; `HashAnchored` event emitted with right args.
  - Verify: `npx hardhat test` fails (no contract yet).
- [ ] **3.2** Implement `IntegrityRegistry.sol` (PDF 8.4) until green.
  - Verify: `npx hardhat test` all passing.
  - Learn: mapping, struct, `onlyOwner`, events, `view`, why `bytes32`.
- [ ] **3.3** Run `npx hardhat node`, deploy with `scripts/deploy.js`, produce `deployment.json`.
  - Verify: deploy prints an address.
  - Learn: node, account, transaction, gas (free locally), ABI.

### Phase 4: Gas and events (the "blockchain analysis" content)
- [ ] **4.1 Gas:** add `hardhat-gas-reporter`; measure `anchorHash` (first vs later versions), `markDeleted`, reads. Compare the PDF's `string recordType` key against a `bytes32` key computed off-chain.
  - Verify: gas table in the journal with a written conclusion.
  - Learn: why storage writes dominate cost (PDF 3.6), simple vs proper design.
- [ ] **4.2 Events:** `scripts/list_anchors.js` rebuilds all anchored (type, id, version, hash) from `HashAnchored` logs only.
  - Verify: output equals what we anchored, with no database involved.
  - Learn: events as on-chain logs; why this is a trustworthier id source than a DB table.

### Phase 5: Python side (the working module)
- [ ] **5.1 Hashing (TDD):** `tests/test_hashing.py`: determinism; one-char change differs; key order irrelevant; NFC equivalence; naive vs aware datetime; `None` vs `""` differ; the `(1,"23")` vs `(12,"3")` case; missing key raises. Then implement `hashing.py` (PDF 8.9).
  - Verify: `pytest tests/test_hashing.py -v` green.
- [ ] **5.2 Chain access:** `chain.py` (PDF 8.10): `anchor`, `mark_deleted`, `get_latest`; deployment path resolved from project root. Test fixture uses `evm_snapshot`/`evm_revert` for a clean chain per test.
  - Verify: anchor then `get_latest` returns the same hash, version 1.
  - Learn: web3.py, `transact` vs `call`, receipts, events.
- [ ] **5.3 Integrity service (TDD):** `db.py` (SQLite `note` + `integrity_log`), tests then `integrity.py` covering: VERIFIED, TAMPERED, MISSING_FROM_DB, DELETED_AUTHORIZED, NOT_ANCHORED, INCONSISTENT, UNAVAILABLE, rollback attack, and the "attacker also edits `integrity_log`" case (still TAMPERED).
  - Verify: `pytest tests/test_integrity.py -v` green.
  - Learn: why the chain is the authority and the DB log is only a convenience.
- [ ] **5.4 CLI demo:** `demo.py` runs PDF 9.3: create note, verify (green), tamper via SQL, verify (red), legitimate edit on a different note (version 2), silent delete, authorised delete.
  - Verify: statuses match the PDF's expected outcomes; paste output into the journal.

### Phase 6: Merkle batching
- [ ] **6.1** `merkle.py` with tests: root for N leaves, proof for one leaf, proof verifies, tampered leaf fails, odd leaf counts.
- [ ] **6.2** Add `anchorRoot(bytes32 root, uint256 count)` to the contract with tests; anchor 100 records in one transaction; verify one record with its proof. Compare gas per record with Task 4.1.
  - Verify: tests pass; gas comparison in the journal.
  - Learn: Merkle trees, inclusion proofs, cost vs granularity (PDF 11).

### Phase 7: Public testnet (Sepolia or Polygon Amoy)
**Flag before starting:** first use of a real wallet private key and a public network. New throwaway wallet, free test tokens only, key in `.env`. I will explain each command first.
- [ ] **7.1** Create throwaway wallet, get faucet tokens, add network to `hardhat.config.js` (key from env).
- [ ] **7.2** Deploy to the testnet; view contract and a transaction on a block explorer.
  - Verify: explorer shows the contract and an anchored hash.
- [ ] **7.3** Switch `chain.py` to sign transactions locally with the private key; rerun the demo against the testnet.
  - Learn: signing vs node-held accounts, nonces, real gas, confirmation time, why a testnet gives the independence a local node lacks.
- [ ] **7.4 Remix demo:** open remix.ethereum.org, paste the same `IntegrityRegistry.sol`, compile it, and connect MetaMask (the throwaway wallet, on Sepolia). Deploy a second instance from Remix, then call `anchorHash`, `verify`, `getLatest` using its buttons, and find the transactions on Etherscan.
  - Verify: `verify` returns true for the anchored hash and false for a changed one, shown in the Remix UI.
  - Learn: the contract is portable across tools (Hardhat or Remix); the same ABI and bytecode result. Remix is good for a live visual demo, Hardhat for automated tests and scripting.

### Phase 8: Report and viva
- [ ] **8.1** Assemble report chapters from the journal (PDF 12.3 mapping); fill the measurements table (`time.perf_counter()`, 20+ runs: hash time, anchor time, verify time, gas); rehearse the 30-second explanation and the Q&A (PDF 12.2).

---

## Test coverage map (PDF 9.2)

| PDF test | Covered in |
|----------|-----------|
| T1 anchor, T2 verify | 5.3 / 5.4 |
| T3 silent edit, T6 silent delete, T7 authorised delete, T8 rollback | 5.3 |
| T4 legitimate edit | 5.3 / 5.4 |
| T10 chain down | 5.3 (`UNAVAILABLE`) |
| T11 non-owner call | 3.1 |
| T12 Unicode/timestamps | 5.1 |
| T5 (API 409 guard), T9 (retry queue), T13 (batch endpoint) | Cut with the web API; guard logic can be a function in `integrity.py` if time allows |

## Risks

- **Tool version drift** (Hardhat 3, web3.py 7): pin versions, check the docs at install time.
- **Windows quirks** (paths, PowerShell vs bash): note each fix in the journal.
- **Hardhat node is in-memory:** restart loses all anchors; document the reset procedure.
- **Faucets can be flaky:** have a backup testnet in mind for Phase 7.
