# Step 24: The API behind the Witness console

Date: 2026-10-21
Phase / Task: Phase 8, Tasks 8.1 to 8.6

## Goal
Give the web console something to talk to: a small, safe API that exposes the integrity
module over HTTP and reports the REAL stages of every blockchain write as they happen.

## Concepts, in plain words
- **API**: a program that waits for requests ("give me the records", "create this note")
  and answers them. The browser cannot do the hashing itself, because the secret key and
  the canonical-JSON rules live in Python. So the browser asks the API, and the API uses
  the code we already built and tested.
- **Stream (NDJSON)**: instead of answering once at the end, the API sends one small JSON
  line for each stage as it happens (`saved`, `fingerprint`, `sent`, `mined`, `done`).
  "NDJSON" means one JSON object per line.
- **Thread and lock**: a write takes seconds on a real network, so it runs on its own worker
  thread. A lock makes sure only one write per network runs at a time, so transactions
  keep their order.

## What we built (every part tests-first)
| Task | What | New tests |
|------|------|-----------|
| 8.1 | `chain.py`: a progress hook (`on_sent`), exact gas and fee from receipts, `history()` from event logs, `status()`, a `TransactionFailed` error for mined-but-failed transactions | 12 |
| 8.2 | The notes module reports its stages through an optional `on_stage` callback; behaviour with no callback is unchanged | 6 |
| 8.3 | `python/api/`: network contexts, one database per network, read endpoints | 14 |
| 8.4 | Streaming write endpoints (create, edit, delete) with failure codes, the one-write lock, the balance floor | 19 |
| 8.5 | The Attack lab endpoints (database-only) | 11 |
| 8.6 | `run_ui.py`, and a test over a REAL HTTP server | 2 |

Python suite: 99 before this phase, **162 now**, plus 34 contract tests.

## Design decisions
1. **A thin layer over tested code.** The API reuses `notes.py`, `integrity.py` and `chain.py`.
   No hashing or contract logic was rewritten. The only changes to existing modules are
   optional callbacks with identical behaviour when unused (verified by the whole older suite
   staying green).
2. **The chain is the source of truth for history.** `history()` rebuilds a record's versions,
   transaction hashes, blocks and deletion from event logs, never from the local database.
3. **One database per network, ids after the chain's highest.** A new database starts its
   note ids after the highest id the chain has ever anchored (read from events), so
   recreating a database can never collide with permanent chain data. Tested.
4. **One write at a time per network.** The lock is released when the WORKER finishes, not
   when the browser disconnects, so a dropped tab can never let two transactions overlap.
5. **Fail clearly.** Each failure has a code and a plain message: `REFUSED`,
   `CHAIN_UNAVAILABLE`, `WRONG_NETWORK`, `LOW_BALANCE`, `TX_FAILED`, `INTERNAL`.
   `INTERNAL` never repeats the underlying error text (tested), and the details go to the
   API log only. A create whose anchoring fails says the note WAS saved.
6. **Sepolia protection.** A write on Sepolia refuses to start if the wallet holds less than
   0.002 ETH, rather than half-finishing.
7. **The Attack lab is separate and local.** It edits the database directly, never touches the
   chain, and is refused while a write runs. It keeps a demo-only history table so "restore an
   earlier text" (the rollback attack) is possible. The API listens on `127.0.0.1` only.

## Proof that streaming is real
The in-process test client cannot prove stages reach a browser as they happen. So one test
starts a real HTTP server, holds a transaction "in flight" (the receipt is withheld), and
checks that `saved`, `fingerprint` and `sent` (with the transaction hash) arrive BEFORE the
receipt does. Mutation check: making the server buffer and send everything at the end makes
that test fail. A manual smoke test against the real server showed the stages arriving at
86, 94, 115, 127 and 139 ms, with the gas used (98,706) equal to the number measured in Step 10.

## Mutation checks (each change proven applied before trusting the result)
About 30 deliberate bugs across the chain additions, stage reporting, read routes, write
routes, Attack lab and streaming were introduced one at a time; every one was caught by the
intended test. Highlights: a lock never released, a wrong failure code, a missing `done`, a
balance floor never checked, leaked error details, a rollback restoring the wrong text, a
"cover tracks" delete wiping every note's log, and buffered streaming.

## Mistakes and weak spots found in my own tests
- Two tests of "this stayed unchanged" (the chain was not touched, the log was not touched)
  passed even before the routes existed, because an absent route also changes nothing. I made
  them also assert that the attack really happened.
- A test of "an unknown note gives 404" would also pass for a missing route; it now asserts our
  own message.
- A test of the signing wallet used Hardhat's key #0, which is the dev node's default account
  anyway, so it would pass even if the key were ignored. It now uses key #1.
- A missing test: nothing checked the Etherscan links, because the local chain has no
  explorer. Added, using a made-up explorer address.
- A real gap in the product: a Sepolia transaction can be mined and still fail (for example out
  of gas). `_send` would have crashed confusingly looking for an event that was never emitted.
  It now raises `TransactionFailed`. The dev node never produces such a receipt, so the test
  hands back a real receipt with its status changed.
- The write test for a down chain first expected `saved, anchor_failed`. The truthful order is
  `saved, fingerprint, anchor_failed`, because the fingerprint WAS computed before the send was
  attempted. The test was corrected, not the code.
- Starlette's test client now prefers the `httpx2` package; installed and pinned.

## What this does not do
No authentication (it is a localhost demo tool). Sepolia writes work but have not been run
from the console: they spend test ETH and need your approval. The history needs the free
public server to return event logs, which it does for ranges up to 50,000 blocks.

## What I should be able to explain after this
(Write this yourself: why does the browser need an API at all, why is each write streamed as
separate stages instead of one answer at the end, and why is the lock released by the worker
and not by the browser?)
