# Phase 8: Witness Demo Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web console where anyone can anchor a note, silently tamper with the database, and watch the blockchain catch it, on a local chain or on Sepolia.

**Architecture:** A thin FastAPI layer (`python/api/`) wraps the existing, tested Python modules and streams the real stages of each chain write as NDJSON. A React + TypeScript app (`frontend/`, built with Vite) renders a ledger, an inspector with a character-level fingerprint comparison ("Seal check"), a dark Attack lab, and a live activity tape.

**Tech Stack:** FastAPI, uvicorn, httpx (tests), pytest; React 19, TypeScript (strict), Vite, TanStack Query, Vitest, React Testing Library, plain CSS Modules, `@fontsource-variable/instrument-sans` and `@fontsource-variable/martian-mono`.

**Spec:** `docs/specs/2026-10-21-demo-console-design.md` (design tokens, layout, copy, API contract). This plan implements it; the spec wins on any visual or contract question.

## Global Constraints

- Existing suites stay green with the node running: Hardhat 34, Python 99 (plus new tests).
- `hashing.py`, `merkle.py`, the contracts and the verification rules are NOT changed. Only additive, backward-compatible changes to `chain.py`, `integrity.py`, `notes.py` (optional callbacks), each covered by new tests.
- The API binds to `127.0.0.1` only. CORS allows only `http://127.0.0.1:5173` and `http://localhost:5173`.
- Secrets never appear in API responses, logs or errors: no private key, no hashing secret. Wallet addresses and transaction hashes are public and may appear.
- Real Sepolia WRITES are never sent by the agent without the user's explicit approval for that action. All build verification uses the local chain; Sepolia is exercised read-only.
- Status vocabulary is exactly the seven in the spec. Status is shown as colour AND icon AND word.
- Every state in spec section 5.6 is designed and tested: loading, empty, error, busy, unavailable network, no selection.
- Accessibility floor: visible keyboard focus, `aria-live` for stage and status changes, AA contrast, `prefers-reduced-motion` respected, works down to 360px width.
- Fonts bundled locally (no CDN). No network is needed to render the UI.
- Mutation checks on new logic: confirm with a diff that the bug is really in the file before trusting a result.
- Write files without a byte-order mark (use `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)` or the editor tools).

## File structure

```
python/
  api/__init__.py
  api/app.py            create_app(); mounts routers, CORS, static files
  api/networks.py       NetworkContext (chain, db path, lock, balance floor) and registry
  api/store.py          open_db(ctx): creates the DB, sets the id floor from chain events; demo_history helpers
  api/stages.py         Stage events, run_streaming(): thread + queue -> NDJSON lines
  api/schemas.py        pydantic request models and status vocabulary
  api/routes_read.py    /networks, /{net}/records, /{net}/records/{id}, /{net}/verify-all
  api/routes_write.py   POST/PUT/DELETE notes (streams)
  api/routes_attack.py  silent edit / delete / restore
  run_ui.py             starts uvicorn on 127.0.0.1:8000
  tests/test_chain_extras.py, test_stages.py, test_api_read.py, test_api_write.py, test_api_attack.py
frontend/
  package.json, vite.config.ts, tsconfig*.json, index.html
  src/main.tsx, App.tsx
  src/styles/tokens.css, base.css
  src/lib/        api.ts, types.ts, diffHex.ts, ndjson.ts, stageReducer.ts, format.ts, statusMeta.ts
  src/hooks/      useNetworks.ts, useRecords.ts, useWrite.ts, useBlockPulse.ts
  src/components/ Header, NetworkSwitch, ChainPulse, NetworkStrip, Composer, SummaryBar,
                  Ledger, RecordRow, StatusStamp, Inspector, SealCheck, VersionTimeline,
                  AttackLab, ActivityTape, StageStepper, EmptyState, ErrorNotice, icons.tsx
  src/**/*.test.ts(x)
docs/journal/24-console-api.md, 25-console-ui.md; docs/how-to-run.md (new section)
```

---

# Part A: the API

### Task 8.1: Chain additions (TDD)

**Files:** Modify `python/chain.py`; create `python/tests/test_chain_extras.py`.

**Interfaces (produced):**
- `Chain._send(w3, call, on_sent=None) -> (tx_hash, receipt)`; `on_sent(tx_hash_hex: str)` is called right after the transaction is sent, BEFORE waiting for the receipt.
- `Chain.anchor(record_type, record_id, digest, on_sent=None) -> dict` adds keys `gas_used: int`, `fee_wei: int` to the existing result; `Chain.mark_deleted(..., on_sent=None) -> dict` now returns `{tx_hash, block_number, gas_used, fee_wei}` (was `None`).
- `Chain.history(record_type, record_id) -> dict` `{versions: [{version, hash(bytes), timestamp, tx_hash, block_number}], deleted: {tx_hash, block_number, timestamp} | None}` built only from event logs (chunked, from the deployment block).
- `Chain.status() -> dict` `{chain_id, block_number, wallet, balance_wei, owner}`; `wallet` is the signing address (key) or the dev node's first account.

**Tests (write first, each asserts concrete values on the real local node):**
1. `on_sent` fires once, before the receipt, with a `0x` hash equal to the returned `tx_hash`.
2. `anchor` result has `gas_used > 0` and `fee_wei == gas_used * effective price`.
3. `mark_deleted` returns a dict with the same keys and still flags the record deleted.
4. `history` returns two versions in order with matching hashes and distinct tx hashes and blocks after two anchors, and `deleted is None`; after `mark_deleted` it returns the deletion's tx hash.
5. `history` of an unknown record returns `{versions: [], deleted: None}`.
6. `status()` returns the local chain id 31337, an integer block number that increases after a transaction, a wallet equal to the first dev account, and `owner == wallet`.
7. Existing 99 tests still pass (backward compatibility).

**Steps:** write tests, run (fail), implement, run all, mutation checks (drop the `on_sent` call; return a wrong block in `history`; swap `gas_used` and `fee_wei`), journal later in 8.6, commit `feat: chain history, status and progress hook`.

### Task 8.2: Stage plumbing through the module (TDD)

**Files:** Modify `python/integrity.py`, `python/notes.py`; extend `python/tests/test_integrity.py`.

**Interfaces:**
- `integrity.anchor_record(conn, chain, record_type, record_id, on_stage=None)`; calls `on_stage("fingerprint", {"hash": hex})` after hashing, passes `on_sent` through, and calls `on_stage("sent", {"tx_hash": ...})` and `on_stage("mined", {"block": int, "gas_used": int, "fee_wei": int, "version": int})`.
- `notes.create_note / update_note / delete_note(..., on_stage=None)`: `create_note` also calls `on_stage("saved", {"note_id": id})` after the database commit; `delete_note` reports `sent`/`mined` for the deletion mark, then `on_stage("removed", {})`.
- When `on_stage` is `None`, behaviour is byte-for-byte unchanged.

**Tests:** stage order for create is exactly `saved, fingerprint, sent, mined`; for update `fingerprint, sent, mined`; for delete `sent, mined, removed`; refused update (tampered) emits NO chain stage and still raises `IntegrityRefused`; all existing tests unchanged and green.
**Commit:** `feat: report real stages from the notes module`.

### Task 8.3: API foundation and read endpoints (TDD)

**Files:** Create `python/api/{__init__,app,networks,store,schemas,routes_read}.py`; `python/tests/test_api_read.py`; modify `python/requirements.txt` (`fastapi`, `uvicorn`, `httpx`, pinned to the installed versions); `.gitignore` (`python/data/`).

**Interfaces:**
- `networks.NetworkContext(id, label, chain, db_path, explorer_base, balance_floor_wei)` with `.lock` (`threading.Lock`); `networks.build_registry(overrides=None) -> dict[str, NetworkContext]`; Sepolia is `ready=False` with a plain `reason` when `.env` lacks the key/RPC or the deployment file is missing; local is `ready=False` with a reason when the node is unreachable or not deployed.
- `store.open_db(ctx) -> sqlite3.Connection`: creates the DB if missing and sets `sqlite_sequence` for `note` to the highest note id the chain has ever anchored; creates table `demo_history(note_id, version, content)`.
- `create_app(registry=None, static_dir=None) -> FastAPI`; routes exactly as spec section 4.

**Tests:**
1. `/api/networks` lists `local` ready with chain id 31337, a block number and the contract address; `sepolia` present, `ready` false with a reason when not configured (use an injected registry).
2. `/api/local/records` on an empty DB returns `records: []` and an empty summary.
3. After anchoring two notes through the module: both listed `VERIFIED` with version 1 and non-null `anchoredAt`.
4. A silent SQL edit makes that record `TAMPERED` in the list; the summary counts reflect it.
5. A record the chain knows but the DB lost appears as `MISSING_FROM_DB` with `inDatabase: false`.
6. Record detail: `fingerprint.database` and `fingerprint.chain` are 64-char hex; `matches` is true when untouched and false after tampering; `versions` lists tx hash and block; unknown id returns 404.
7. `verify-all` summary equals the list's summary.
8. A fresh DB created after the chain already holds note id 7 starts new ids at 8.
9. Unknown network returns 404; a network that is not ready returns 503 with its reason.
10. Responses never contain the secret key or private key (assert on the raw text).
**Commit:** `feat: add API foundation and read endpoints`.

### Task 8.4: Streaming writes (TDD)

**Files:** Create `python/api/{stages,routes_write}.py`; `python/tests/test_stages.py`, `test_api_write.py`.

**Interfaces:**
- `stages.run_streaming(ctx, work) -> Iterator[bytes]`: acquires `ctx.lock` non-blocking; runs `work(emit)` in a worker thread; yields one NDJSON line per event (each with `t` ms); always ends with `done` or `failed`; releases the lock in `finally`; maps `IntegrityRefused` to `REFUSED`, `ChainUnavailable` to `CHAIN_UNAVAILABLE`, `WrongNetwork` to `WRONG_NETWORK`, a low balance to `LOW_BALANCE` (checked before sending), failed receipts to `TX_FAILED`.
- Routes `POST /api/{net}/notes`, `PUT /api/{net}/notes/{id}`, `DELETE /api/{net}/notes/{id}`; each writes `demo_history` on create and edit.

**Tests:** create streams `saved, fingerprint, sent, mined, done` in order with a `0x` tx hash and an integer block; the new record then reads `VERIFIED`; edit increments the version; edit of a tampered record streams `failed` with code `REFUSED` and no `sent`; delete streams `sent, mined, done` and the record reads `DELETED_AUTHORIZED`; empty and over-500-character content give 422; a second write while one is running gets 409 `BUSY` (use an injected slow chain double); chain down gives `failed CHAIN_UNAVAILABLE`; a Sepolia-like context with a balance below the floor gives `failed LOW_BALANCE` and sends nothing; the lock is released after every outcome.
**Commit:** `feat: stream real chain stages from write endpoints`.

### Task 8.5: Attack lab (TDD)

**Files:** Create `python/api/routes_attack.py`; `python/tests/test_api_attack.py`.

**Tests:** silent edit changes the DB and the record reads `TAMPERED`; silent delete makes it `MISSING_FROM_DB`; restore needs an earlier text (409 with a plain message when there is none) and after a legitimate edit followed by restore the record reads `TAMPERED` (rollback attack caught); with `coverTracks` the local `integrity_log` is also rewritten (edit) or emptied (delete) and the record STILL reads `TAMPERED` / `MISSING_FROM_DB`; unknown note id returns 404; attacks never call the chain (assert transaction count unchanged).
**Commit:** `feat: add Attack lab endpoints`.

### Task 8.6: Runner, static serving, docs

**Files:** Create `python/run_ui.py`; modify `docs/how-to-run.md`; journal `docs/journal/24-console-api.md`.

**Steps:** `run_ui.py` starts uvicorn on `127.0.0.1:8000`; if `frontend/dist` exists it is served at `/`. Full Python suite plus mutation checks on `stages.py` (lock never released; wrong failure code; missing `done`), journal, commit `feat: run script and API journal`.

---

# Part B: the frontend

### Task 9.1: Scaffold, tokens, fonts

**Files:** `frontend/*` scaffold (Vite React TypeScript), `src/styles/tokens.css`, `base.css`.
Install: react, react-dom, `@tanstack/react-query`, the two fontsource-variable packages, and dev: vitest, jsdom, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. Tokens exactly as spec 5.1 as CSS custom properties; base styles (reset, focus ring, reduced-motion, type scale). `vite.config.ts` proxies `/api` to `http://127.0.0.1:8000`.
**Verify:** `npm run build` succeeds; a blank page renders the fonts offline. **Commit:** `feat: scaffold the console frontend`.

### Task 9.2: Logic modules (TDD, no UI)

**Interfaces and tests (write first):**
- `diffHex(chain: string|null, database: string|null) -> {chars: [{c: string, same: boolean}][2], differing: number, total: 64, identical: boolean}`: handles `0x` prefixes and case; identical gives 0 differing; two unrelated hashes differ in about 60 of 64; either side null gives `identical: false` with all marked different; mismatched lengths handled without throwing.
- `parseNdjsonStream(body: ReadableStream<Uint8Array>) -> AsyncIterable<StageEvent>`: handles a JSON object split across chunks, several objects in one chunk, a trailing line with no newline, and ignores blank lines; a malformed line yields an `failed` event with code `INVALID`.
- `stageReducer(state, event) -> state`: models the ordered stages with `status: idle|running|done|failed`, records tx hash, block, gas, fee; unknown event ignored; `failed` stops the run; `reset` returns idle.
- `format`: `timeAgo(unixSeconds, now)`, `ethFromWei`, `shortHash(h, 6, 4)`, `blockNumber(n)` (thousands separators).
- `statusMeta`: label, icon key and token colour for all seven statuses; exhaustive (a test fails if a status is missing).
- `api.ts`: typed fetchers; the NDJSON writer returns an async iterator; HTTP 409 maps to `BUSY`, 422 to `INVALID`.
**Commit:** `feat: console logic modules with tests`.

### Task 9.3: Shell

`Header`, `NetworkSwitch` (disabled segment shows the reason), `ChainPulse` (polls the block number; fades on change; announces politely), `NetworkStrip`. `App` holds the selected network and selected record. States: loading and error for `/networks`.
**Acceptance:** switching network refetches records; Sepolia unavailable shows its reason; the strip colour differs per network. Component tests for NetworkSwitch and ChainPulse.

### Task 9.4: Ledger

`Composer`, `SummaryBar` (segmented proportional bar plus counts and Verify all), `Ledger`, `RecordRow`, `StatusStamp`, `EmptyState`, `ErrorNotice`. Skeleton rows while loading. Ghost rows (chain-only) styled distinctly with "not in database".
**Acceptance:** all seven statuses render with icon, word and colour; keyboard selection with arrow keys and Enter; stamp animation only when status changes (not on first paint). Tests for StatusStamp (every status), Ledger states.

### Task 9.5: Inspector

`Inspector`, `SealCheck` (uses `diffHex`; 8 groups of 8; matched muted, differing marked; caption with the real count), `VersionTimeline` (version, hash, time, tx hash with copy and Etherscan link on Sepolia, block, gas/fee when known).
**Acceptance:** SealCheck for identical and tampered inputs matches `diffHex` counts; copy buttons announce "Copied"; no selection shows the instruction. Tests for SealCheck.

### Task 9.6: Writes and the activity tape

`useWrite` consumes the NDJSON stream into `stageReducer`; `StageStepper` (real stages, elapsed time, current-stage pulse, `aria-live`); `ActivityTape` (bottom feed of real events across the session, newest first, mono). Composer, edit and delete controls disable while busy; BUSY from the API is shown plainly.
**Acceptance:** a simulated stream renders each stage as its event arrives; failure shows the code's plain-language message; after `done` the ledger and inspector refresh. Tests with a mocked stream.

### Task 9.7: Attack lab

Dark drawer opened from the inspector: Silent edit (text field), Silent delete, Restore earlier text, Cover my tracks (checkbox with a one-line explanation), result line, and automatic verify-all after each attack so the status flip is visible. Focus is trapped while open; Esc closes.
**Acceptance:** each action calls the right endpoint and the row flips status with the stamp animation; restore with no history shows the API's plain message.

### Task 9.8: Polish and visual critique

Responsive layouts (inspector slide-over below 1100px, cards below 700px); reduced motion; contrast check of every token pair against WCAG AA; copy pass against spec 5.5. Take screenshots with a headless browser at 1440x900, 1024x768 and 390x844 for each key state, review them against the spec and the three-defaults critique, and fix what is weak. Record findings in the journal.

### Task 9.9: End to end

Build the app, start the node, deploy, run `run_ui.py`, and drive the real story in a headless browser: create two notes, verify, silent edit shows Tampered and a lit Seal check, legitimate edit refused, rollback, silent delete, verify-all, cover-tracks variant, network toggle with Sepolia read-only. Save screenshots (outside the repo), journal `25-console-ui.md`, update `docs/how-to-run.md`, run every suite, commit and (only if the user asks) push.

---

## Self-review

- **Spec coverage:** every API row and event in spec section 4 maps to Tasks 8.3 to 8.5; every component in section 6 to Tasks 9.3 to 9.7; tokens, copy, states and motion to 9.1, 9.4 to 9.8; testing in section 8 to each task and 9.9.
- **Placeholders:** none in logic or contracts. Visual components are specified by props, states, acceptance criteria and the spec's tokens rather than pre-written code, because the visual design is iterated against screenshots in Task 9.8.
- **Type consistency:** stage names `saved, fingerprint, sent, mined, removed, done, failed` and failure codes are identical in 8.2, 8.4, the spec and `stageReducer`; the status vocabulary is identical in the API, `statusMeta` and the spec.
- **Risk covered:** busy lock, low balance, chain down and refused edit each have a test and a plain message.
