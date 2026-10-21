# Blockchain Data Integrity Module

Tamper-evidence for an AI memory assistant's records (notes, conversations,
calendar events). Sensitive data stays in PostgreSQL; only a keyed hash
(HMAC-SHA256) of each record is anchored on a blockchain (Solidity contract on
a local Hardhat chain). Later we recompute the hash from the database and
compare it with the chain: match = untouched, mismatch = tampered.

Source design: `Blockchain_Data_Integrity_Verification_Report.pdf` (v1.0).

## Status

| Part | State |
|------|-------|
| Contracts (single-record and Merkle), local and Sepolia deployment | Done |
| Python integrity module, CLI demos, tamper detection | Done |
| Witness web console (Local and Sepolia) | Done: runs end to end on the local chain |
| Sepolia demo run with measured real cost (plan 7.5), Etherscan source verification (7.7, optional) | Not done |
| Report and viva material (plan Phase 9) | Not done |

Tests: Hardhat 34, Python 165, frontend 162. How to run everything: `docs/how-to-run.md`.

## Folder map

| Path | What lives here |
|------|-----------------|
| `docs/00-master-plan.md` | The roadmap: phases, tasks, decisions, risks |
| `docs/concepts.md` | Plain-English explanations of each concept (written as we meet it) |
| `docs/journal/` | One file per work step: what we did, why, commands, output, what we learned |
| `experiments/` | Small standalone learning scripts (hash demo, toy blockchain) |
| `blockchain/` | Hardhat project: contract, tests, deploy script (created in Phase 2) |
| `python/` | Hashing, chain access, integrity service, CLI demos, the FastAPI layer (`python/api/`) and pytest tests |
| `frontend/` | The Witness console: a React + TypeScript web interface for the demo (see `frontend/README.md`) |

Rule: `docs/` holds documentation only. Code lives in `experiments/`,
`blockchain/` or `python/`.

## Documentation rule

Every step we do gets a journal entry in `docs/journal/` using
`docs/journal/_TEMPLATE.md`. Rule of thumb: if a step changed a file or ran a
command that mattered, it gets an entry *before* we move on.
