# Step 12: Settings and the hashing module

Date: 2026-10-05
Phase / Task: Phase 5, Task 5.1

## Goal
Turn a database record into a fixed, unambiguous byte string and then into a
32-byte keyed hash, the exact value that will be stored on the blockchain.

## Why this step exists
Verification means: "recompute the hash from the database row today and compare
it with the hash anchored on the chain earlier". That only works if the SAME row
ALWAYS produces the SAME bytes. Any tiny instability (field order, a different
way of writing the same accented letter, a timezone difference) would produce a
different hash and a false "tampered" alarm. This module is where that
determinism is built, and it is the foundation everything else rests on.

## What we did
Test first, as always:
1. Installed `python-dotenv` and pinned it (`python-dotenv==1.2.4`).
2. Created `python/settings.py` (reads settings from `python/.env`), `pytest.ini`,
   `.env.example` (a template, safe to commit) and `conftest.py` (shared test
   setup).
3. Generated the real `python/.env` containing a random 64-hex-character secret
   key, written straight to the file so it was never printed to the screen or
   this transcript. Git ignores it (rule `.gitignore:2`).
4. Wrote `tests/test_hashing.py` (15 tests) and ran it: `ModuleNotFoundError: No
   module named 'hashing'` (expected).
5. Wrote `python/hashing.py`, and two throwaway stubs (`chain.py`, `db.py`)
   because `conftest.py` imports them; Tasks 5.2 and 5.3 replace the stubs.

## Output / evidence
```
Before hashing.py existed:  ModuleNotFoundError: No module named 'hashing'
After:                      15 passed

Mutation 1 (removed Unicode normalisation): 1 failed (test_unicode_normalisation...), 14 passed
Mutation 2 (None turned into ""):           1 failed (test_none_and_empty_string_differ), 14 passed
Restored:                                   15 passed
```

## The canonical format, rule by rule (PDF 7.2)
| Rule | Why |
|------|-----|
| Fields sorted by name; JSON with sorted keys and no spaces | Same data always gives the same text, whatever order Python happens to hold it in |
| JSON with named fields instead of joining values | Avoids the `(1,"23")` vs `(12,"3")` collision from Step 02 |
| Text normalised to Unicode NFC | The letter "é" can be one character or "e" plus a combining accent; they look identical but are different bytes. NFC makes them the same |
| Timestamps converted to UTC, one fixed format | Same moment in a different timezone must give the same text. A timestamp without a timezone is treated as UTC (a documented assumption) |
| `None` stays JSON `null`, never `""` | "no value" and "empty text" are different facts and must hash differently |
| `type` and schema version `v` inside the payload | A note and a conversation with identical fields must not collide, and a future format change can be told apart from an old one |
| `ensure_ascii=False`, UTF-8 | Keeps non-Latin text readable and consistent instead of `\uXXXX` escapes |

The result is then passed through **HMAC-SHA256** with the secret key
(`keyed_hash`). Output is exactly 32 bytes, the size of a Solidity `bytes32`.

## The "golden test"
`test_golden_format_is_frozen` asserts the exact bytes for one fixed record:
`{"data":{"content":"hello","interactionid":1,"noteid":7},"type":"note","v":1}`.
If anyone ever changes the format by accident (even adding a space), this test
fails. It matters because changing the format would silently change every hash
and make every existing record look tampered. If we change it on purpose, we
bump `SCHEMA_VERSION`.

## About the secret key
- It lives only in `python/.env` (ignored by git) and is read from the
  `INTEGRITY_SECRET_KEY` environment variable. Never in the database, the chain,
  the source code, or this journal.
- Tests deliberately use their own fixed fake key (set in `conftest.py` before
  anything else loads), so tests never depend on or expose the real one.
- Losing the key means old records can never be re-verified (PDF 7.3). For this
  project, back up `python/.env` somewhere private.
- Environment variables win over `.env` (python-dotenv's default), which is how
  a real deployment would supply the key instead of a file.

## Limitations to keep in mind
- Only the fields listed in `RECORD_SPECS` are protected (coming in Task 5.3). A
  change to any other column is not detected; we test this and document it.
- Treating timezone-less timestamps as UTC is an assumption. SQLite stores
  timestamps as text, and we exclude `created_at` from the note hash anyway.

## Concepts met in this step
Canonical serialisation (built, not just defined), Unicode normalisation (NFC),
HMAC in code, golden test, environment variable, `.env` file, mutation check.
(See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: `sha256(str(row))`. Short, and wrong: dict order, type quirks and
  timezones would make it unstable.
- Proper: canonical JSON plus HMAC with a managed secret key.
- Tradeoff: more code and a key to look after, in exchange for a hash that is
  stable, unambiguous, and unguessable on a public chain.

## What I should be able to explain after this
(Write this yourself: why must the same row always produce the same bytes, and
name two ways the format could silently go wrong without canonicalisation. Why
does the key live in `.env` and not in the code?)
