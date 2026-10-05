# Step 14: The integrity service

Date: 2026-10-05
Phase / Task: Phase 5, Task 5.3

## Goal
Build the heart of the project: anchor a record's hash on the chain, and later
verify a database row against the chain, reporting exactly what state it is in.

## What we did
Test first: wrote `tests/test_integrity.py` (20 tests) and ran it
(`ModuleNotFoundError: No module named 'integrity'`). Then wrote:
- `python/db.py`: SQLite connection, tables `note` and `integrity_log`.
- `python/integrity.py`: the module itself.
- `python/notes.py`: a small stand-in "application" (create, update, delete a
  note). It shows where a real app calls the module. Our real memory-assistant
  app is not in this repo, so this stands in for it (decision D1).

## Output / evidence
```
Before:  ModuleNotFoundError: No module named 'integrity'
After:   20 passed;  whole suite 43 passed (15 hashing + 8 chain + 20 integrity)
```
Mutation checks (we deliberately broke the code; each time the right tests failed):

| Bug we introduced | Tests that caught it |
|-------------------|----------------------|
| `verify` always claims the hashes match | 5 tests (silent edit, rollback attack, update-refused, attacker-rewrites-log, verify_all summary) |
| update allowed on a TAMPERED record | `test_update_is_refused_on_a_tampered_record` |
| `verify_all` ignores ids from chain events | `test_verify_all_catches_row_deleted_together_with_its_log_entries` |
| update allowed while the chain is unavailable | `test_update_is_refused_when_chain_is_down` |
After restoring each time: all passing.

## How verification decides (the seven statuses)
`verify_record` reads the chain first, then the database row, then decides:

| Status | Condition | Meaning |
|--------|-----------|---------|
| `VERIFIED` | row exists, not deleted on chain, recomputed hash equals latest chain hash | untouched since the last anchor |
| `TAMPERED` | same, but hashes differ | content changed outside the app |
| `MISSING_FROM_DB` | chain has it, row is gone, no deletion flag | removed without authorisation |
| `DELETED_AUTHORIZED` | row gone and chain says deleted | proper deletion |
| `NOT_ANCHORED` | chain has no version for it | created before the module, or the anchor failed |
| `INCONSISTENT` | chain says deleted but the row still exists | process error or tampering |
| `UNAVAILABLE` | cannot reach the chain | cannot say; never reported as VERIFIED |

The hash comparison uses `hmac.compare_digest`, which takes the same time
whether or not the values match, a good habit for comparing secrets.

## Design decisions (the reasoning is the valuable part)

**1. Create is fail-open; update and delete are fail-closed.**
- If the chain is down while creating a note, we still save it. The record then
  reports `NOT_ANCHORED`, which is honest: "no proof yet".
- If the chain is down while UPDATING, saving would change the database while the
  chain still holds the old hash. The record would then falsely show `TAMPERED`, a
  false alarm. So we refuse the update until the chain can confirm the state.
- Delete marks the chain first and only then removes the row, so a down chain
  leaves the row in place.
- This fixes a gap in the PDF: its retry queue (which we cut) was the only thing
  stopping that false alarm, and its delete route had no error handling.
- Cost of fail-closed: a user cannot edit while the blockchain is unreachable.
  For a safety-critical memory aid that is the safer failure.

**2. The verify-before-update guard** refuses updates on `TAMPERED` records. If
we re-anchored a tampered row, the chain would then "bless" the forged content as
the truth (PDF 7.6). Allowed states: `VERIFIED` and `NOT_ANCHORED` only.

**3. The chain is the authority; `integrity_log` is never read to decide a
result.** Test `test_attacker_who_also_rewrites_integrity_log_is_still_caught`
proves it: the attacker edits a row AND forges the log's hash, and the record is
still `TAMPERED`.

**4. `verify_all` takes record ids from the chain's event logs as well as the
database** (Step 11's idea, now in Python). Test
`test_verify_all_catches_row_deleted_together_with_its_log_entries` deletes a row
and its entire local log; the chain still reports the record, giving
`MISSING_FROM_DB`.

**5. No UNIQUE constraint on `integrity_log`** (the PDF has one). The log is only
a convenience copy. A failed insert after a successful chain write would leave
the chain and log out of step, and a restarted local chain (versions reset to 1)
would collide with old rows.

**6. SQL safety.** Table and column names come only from the `RECORD_SPECS`
whitelist; values always use `?` placeholders. `test_unknown_record_type_is_rejected`
sends `"users; DROP TABLE note"` as a record type and gets a `ValueError`.

## What the tests map to in the PDF (section 9.2)
T1 anchor (`create_anchors_and_verifies`), T2 verify, T3 silent edit, T4
legitimate edit, T5 update refused on tampered, T6 silent delete, T7 authorised
delete, T8 rollback attack, T10 chain down, T12 Unicode. T9 (retry queue) and T13
(batch API endpoint) were cut; `verify_all` covers the batch idea. T11 (non-owner)
is in the contract tests (Step 06). Tests beyond the PDF: attacker rewrites the
log, row and log both deleted, unprotected-column edit, fail-closed update and
delete, `INCONSISTENT`, never-anchored delete.

## Honest limitations
- `test_editing_an_unprotected_column_is_not_detected` documents that a change to
  a column outside the hashed field list (here `created_at`) is invisible. This
  is the PDF's "only listed fields are protected" limitation, visible in a test.
- A note created while the chain is down stays `NOT_ANCHORED` until someone
  anchors it; we have no automatic retry. During that window the row could be
  changed before it is ever anchored (PDF 10, "anchoring happens after the save").
- A single owner key and a single local node: this shows the mechanism, not
  independent trust (Step 03, stage 4).
- `create_note` catches every exception when anchoring, so a genuine bug in the
  anchoring code would be logged as a warning and not stop the save. That
  matches "never block the user" but means the log must be watched.

## Concepts met in this step
Fail-open vs fail-closed, verify-before-update guard, source of truth, constant-
time comparison, SQL parameterisation and whitelisting, rollback attack, false
positive. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: let create, update and delete all ignore chain failures (the PDF's
  create route) and rely on a retry queue.
- Proper: choose per operation, with fail-open only where the failure is honest
  (`NOT_ANCHORED`) and fail-closed where it would cause a false alarm or a hidden
  change.
- Tradeoff: more rules to explain, but no false alarms and no silent gaps, and
  we avoid building a retry queue we then have to trust.

## What I should be able to explain after this
(Write this yourself: why is "update while the chain is down" refused but
"create while the chain is down" allowed? And why can an attacker who also edits
the local `integrity_log` still not hide a change?)
