# Witness: a demo console for blockchain record integrity

Status: approved in outline by the user (architecture and API sections explicitly; the rest
delegated with "create everything"). Date: 2026-10-21.

## 1. Purpose

**Subject.** The integrity layer built in Phases 3 to 7: record fingerprints anchored on a
blockchain so that silent changes to a database become detectable.

**Audience.** An examiner (and the student presenting) who must SEE, in about five minutes, that
the chain remembers what the database forgot.

**Single job.** Make "anchor, tamper, detect" legible and believable: real transaction hashes,
real block numbers, a visible comparison of the two fingerprints, and an honest live state.

**Not in scope (this version).** Merkle batching screen, pipeline explainer, cost and gas panel,
user accounts, multi-user use, deployment to the internet. The API binds to localhost only.

## 2. Decisions already made with the user

| Decision | Choice |
|----------|--------|
| What the UI is | Demo console only (technical control room), not a caregiver product |
| Network | Switchable Local / Sepolia, one toggle, always-visible network badge |
| Scope | Core console: records ledger with live status, create/edit/delete through the app, Attack lab, verify-all, record inspector (versions, fingerprint, transaction, block, Etherscan link) |
| Architecture | FastAPI + React (Vite), live staged progress from real events |

## 3. Architecture

```
 Browser (React) <--JSON + NDJSON stream--> API (FastAPI, 127.0.0.1:8000) --> existing Python modules --> Local node | Sepolia
                                                      \--> SQLite, one file per network
```

- New Python code lives in `python/api/`; the React app in `frontend/`. Hashing, contracts and
  integrity logic are reused unchanged, so all earlier tests remain the source of truth.
- Production-style run: `npm run build` writes `frontend/dist`; the API serves it. One command:
  `python run_ui.py`. Development: API on 8000 plus Vite on 5173 with an `/api` proxy.
- One database per network: `python/data/local.db`, `python/data/sepolia.db` (git-ignored). When a
  database is first created, its note ids start AFTER the highest id the chain has ever anchored
  (read from event logs), so recreating a database can never collide with permanent chain data.
- One write at a time per network (a lock) so transactions keep their order. A second write gets
  HTTP 409 `busy`; the UI disables write controls while one runs.
- Sepolia writes refuse to start when the wallet balance is below a floor (0.002 ETH) with a plain
  `LOW_BALANCE` failure, instead of half-finishing.

## 4. API contract

All paths under `/api`. `{net}` is `local` or `sepolia`. JSON, camelCase keys.

### Reads
| Request | Response |
|---------|----------|
| `GET /networks` | `[{id, label, chainId, ready, reason, blockNumber, wallet, balanceEth, owner, contracts:{integrity, merkle}, explorer}]` |
| `GET /{net}/records` | `{summary:{<status>:count}, records:[{id, content, status, version, anchoredAt, inDatabase}]}` (includes ghost records known only to the chain) |
| `GET /{net}/records/{id}` | `{id, status, row:{content}|null, fingerprint:{database, chain, matches}, deleted, versions:[{version, hash, timestamp, txHash, block, explorerUrl}], deletion:{txHash, block, explorerUrl}|null}` |
| `POST /{net}/verify-all` | `{summary, results}` (same status vocabulary) |

Statuses: `VERIFIED, TAMPERED, MISSING_FROM_DB, DELETED_AUTHORIZED, NOT_ANCHORED, INCONSISTENT, UNAVAILABLE`.

### Writes (NDJSON stream, one JSON object per line)
`POST /{net}/notes {content}`, `PUT /{net}/notes/{id} {content}`, `DELETE /{net}/notes/{id}`.

Events: `saved {noteId}`, `fingerprint {hash}`, `sent {txHash, explorerUrl}`,
`mined {block, gasUsed, feeWei, feeEth, version?}` (`feeWei` is a string, `version` is absent for a
deletion), `removed {}` (delete only: the row has left the database), `done {noteId}`,
`failed {code, message}` with code in `REFUSED, CHAIN_UNAVAILABLE, WRONG_NETWORK, LOW_BALANCE,
TX_FAILED, INTERNAL`. The last line is always `done` or `failed`. A create whose anchoring fails ends
with `failed` but the note HAS been saved (the message says so). BUSY and invalid input are plain
HTTP errors (409 and 422) returned before any stream starts.
Each event also carries `t` (milliseconds since the request began).
Invalid input (empty or over 500 characters) is HTTP 422 before any stream starts.

### Attack lab (database only, instant, never touches the chain)
`POST /{net}/attack/edit {id, content, coverTracks}`, `POST /{net}/attack/delete {id, coverTracks}`,
`POST /{net}/attack/restore {id, coverTracks}`. Each returns `{ok, detail}`.
`coverTracks` also rewrites the local `integrity_log`, proving the chain is the authority.
Restore needs an earlier text, so the API keeps a small DEMO-ONLY table `demo_history`
(note id, version, content), written by the API on each create and edit. The real assistant would
not have it.

## 5. Interface design

### 5.1 Design tokens

| Role | Value | Use |
|------|-------|-----|
| Paper | `#F2F4F0` | page background (cool green-grey, deliberately not cream) |
| Panel | `#FBFCFA` | cards and ledger |
| Ink | `#141A22` | text |
| Muted | `#5E6A78` | secondary text |
| Rule | `#D5DBD3` | borders |
| Verified | `#0B7A5B` | deep green, status only |
| Tampered | `#C4301C` | signal red, status only |
| Missing | `#A86A00` | amber, status only |
| Slate | `#6B7685` | not anchored, unavailable |
| Adversary | panel `#0E1218`, accent `#FF6A3D` | the Attack lab only |

Status always appears as colour + icon + word (never colour alone).

Type: **Instrument Sans** (variable, 400 to 700) for the interface; **Martian Mono** (variable) for
hashes, ids, block numbers and the activity tape. Scale 12 / 13 / 15 / 17 / 22 / 32; mono is set one
size down from its neighbouring sans text. Both bundled with `@fontsource` (no CDN, works offline).

Shape: 6px radius on inputs and buttons, 10px on panels; 1px rules, a single soft shadow only on
the open drawer. No gradients. No emoji.

### 5.2 Layout (desktop first, projector-friendly)

```
+-----------------------------------------------------------------------------------+
| Witness   record integrity console     [ Local | Sepolia ]  block 11,953,472 ·  0.0334 ETH   |
+----------------------------------------------------------------+------------------+
| [ new note ...............................  ] [Save and anchor] |  INSPECTOR       |
|                                                                 |  Note 3  ■ Tampered
| Verified 4  | Tampered 1 | Missing 1       [ Verify all ]       |  Seal check      |
| ┌─ ledger ─────────────────────────────────────────────────┐   |  chain   5c44 1319…
| │ # │ Note                     │ Status       │ v │ anchored │   |  database aced 92d4…
| │ 1 │ Doctor appointment ...   │ ✓ Verified   │ 2 │ 2m ago   │   |  61 of 64 differ  |
| │ 2 │ Call Anna ...            │ ✗ Tampered   │ 1 │ 2m ago   │   |  History          |
| └──────────────────────────────────────────────────────────┘   |  v1 tx 0x69ac…    |
|                                                                 |  [ Attack lab ▸ ] |
+----------------------------------------------------------------+------------------+
| ACTIVITY  14:02:11 sent 0x69ac…  →  14:02:23 mined block 11,953,418 · 6,695,317 gas |
+-----------------------------------------------------------------------------------+
```

- **Header**: brand, the network switch (a two-segment control that shows chain id on hover),
  a live block height that ticks when a real new block arrives (polled every 4 s local, 12 s
  Sepolia), and the wallet balance on Sepolia. A coloured network strip under the header
  (neutral for local, indigo for Sepolia) removes any doubt about which network is live.
- **Ledger** is the main object: a dense, readable table, selectable rows, a status stamp per row.
- **Inspector** (right) answers "why is this status what it is": the Seal check, then the history.
- **Attack lab** opens as a DARK drawer from the inspector. Dark means "you are the attacker now".
- **Activity tape** (bottom) is the live record of real stages and transactions.
- Below 1100px the inspector becomes a slide-over; below 700px the ledger becomes stacked cards.

### 5.3 Signature element: the Seal check

Two 64-character fingerprints, set in Martian Mono in 8 groups of 8, aligned character for
character: "chain remembers" above, "database now" below. Characters that match are quiet
(muted ink); characters that differ are marked (red text on a pale red cell). A caption states the
count ("61 of 64 characters differ"). Verified shows identical rows and the caption "identical".
It makes the avalanche effect visible and shows WHY a record is flagged. It is computed from real
values returned by the API, never mocked.

### 5.4 Motion (restrained)
- Status stamp: a 140 ms scale-and-fade when a status changes, so a flip to Tampered is noticed.
- Stage stepper during a write: each real stage lights as its event arrives; the current stage
  has a quiet pulse. No fake progress; elapsed time is shown.
- New block: the block height changes with a 200 ms colour fade.
- Everything respects `prefers-reduced-motion` (no animation, state changes still visible).

### 5.5 Copy
Sentence case, plain verbs, same name for an action throughout.
Statuses: Verified, Tampered, Missing from database, Deleted (authorised), Not anchored yet,
Inconsistent, Chain unreachable.
Actions: "Save and anchor", "Edit and re-anchor", "Delete and record it", "Verify all".
Attack lab (as built): "Change the text", "Delete the row", "Roll back", "Cover the tracks",
"Run the attack", "Check against the chain".
Empty ledger: "No notes on {network} yet. Write one above and it will be anchored on the chain."
Errors say what happened and what to do, with no apology, e.g. "Chain unreachable. Start the local
node (npx hardhat node) and deploy the contracts, then try again."

### 5.6 States to design for
Loading (skeleton rows), empty, error, busy (write in flight), network unavailable (switch segment
disabled with the reason), no selection (inspector shows a short instruction), reduced motion,
keyboard focus visible everywhere, aria-live announcements for stage changes and status flips.

## 6. Components (frontend)

`App`, `Header`, `NetworkSwitch`, `ChainPulse`, `NetworkStrip`, `Composer`, `SummaryBar`,
`Ledger`, `RecordRow`, `StatusStamp`, `Inspector`, `SealCheck`, `VersionTimeline`, `AttackLab`,
`ActivityTape`, `StageStepper`, `EmptyState`, `ErrorNotice`.
Logic modules with unit tests: `diffHex`, `parseNdjsonStream`, `stageReducer`, `formatters`
(time ago, ETH, short hash), `statusMeta` (label, icon, colour per status), `api` client.
Server state with TanStack Query; local UI state with React state. Plain CSS with custom
properties and CSS Modules; hand-drawn inline SVG icons (about 12). No component library.

## 7. Design critique against the common AI looks

Checked against the three clusters (cream + serif + terracotta; near-black + single acid accent;
broadsheet hairlines with zero radius). This design: uses a cool green-grey paper, not cream; has
no serif display and no terracotta; is LIGHT with colour reserved for status, using dark only as a
meaningful device for the attacker's panel; has rounded, not zero-radius, shapes and a dense table
rather than newspaper columns. Structure encodes true content: the stage stepper reflects real
ordered events (a true sequence); the numbers in the ledger are real record ids; block heights are
live. No decorative numbering, no gradient hero, no stat-card row. The one memorable thing is the
Seal check.

## 8. Testing and verification

- API: pytest with FastAPI's test client against the real local node (skips politely if absent);
  streams are consumed and every event order and failure code asserted; attack endpoints assert
  database effects and the resulting verification status.
- Chain additions: `on_sent` callback, `history`, `status`: unit and integration tests.
- Frontend logic: Vitest for the pure modules; React Testing Library for StatusStamp, SealCheck,
  StageStepper and the ledger's states.
- Real end-to-end: start node, deploy, start the built app, drive it with a headless browser
  (screenshots reviewed for design critique), and run the full story: create, verify, silent
  edit, see Tampered with the Seal check lit, legitimate edit refused, rollback, silent delete,
  verify-all.
- Mutation checks on the new API and logic code, as in earlier phases.
- Sepolia: read-only checks only unless the user approves spending test ETH.

## 9. Risks and open points

- A Sepolia write takes about 12 to 30 seconds; the staged stream is the mitigation. Free public
  RPC servers rate-limit; reads are parallel but small, and failures surface as `UNAVAILABLE`.
- Real gas and fee on Sepolia use the new (Glamsterdam) prices; the UI shows measured values from
  receipts only, never estimates presented as results.
- The Attack lab changes the database directly by design. It is a demo tool, documented as such.
