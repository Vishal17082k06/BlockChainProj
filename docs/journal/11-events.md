# Step 11: Rebuilding records from event logs

Date: 2026-10-05
Phase / Task: Phase 4, Task 4.3

## Goal
Write a function that reconstructs every anchored record, with its version
history and deleted status, using ONLY the blockchain's event logs.

## Why this step exists
The PDF's `verify-all` endpoint finds which records to check by reading the
`integrity_log` table. That table lives in the same database an attacker might
control. If an attacker deletes a row AND its `integrity_log` entry, the
database no longer says the record ever existed, so the deletion would not be
noticed. The chain remembers regardless. Events are the chain's own log of what
happened, so asking the chain "which records were ever anchored?" removes the
database from the trust path (PDF 8.13 box, "Stronger deletion detection").

## Concept: events versus storage
- **Storage** is the contract's working memory: other contract code can read it,
  and writing it is expensive (Step 10).
- An **event** is a log entry written into the transaction's receipt when the
  contract executes `emit`. Contracts cannot read events back, but programs
  outside the chain can search them cheaply. Events are part of the permanent
  chain record.
Our contract does both: storage for `verify`, events for history and discovery.

## What we did
Test first:
1. Wrote `blockchain/test/anchors.test.js` (3 tests): empty contract gives an
   empty list; a mixed scenario (two records, one re-anchored, one deleted)
   rebuilds versions, order and deleted flags; and the rebuilt latest hash and
   version agree with the contract's own `getLatest`.
2. Ran it: `Cannot find module '../scripts/lib/anchors'` (expected failure).
3. Wrote `blockchain/scripts/lib/anchors.js` (`collectAnchors`): reads all
   `HashAnchored` and `RecordMarkedDeleted` events and groups them by record.
4. Wrote `blockchain/scripts/demo_events.js`: deploys a fresh contract, anchors
   a few demo records, prints the rebuilt list. It uses its own contract copy, so
   our main deployment stays clean.

## Output / evidence
```
Before:  Cannot find module '../scripts/lib/anchors'
After:   24 passing   (17 contract + 4 variant + 3 anchors)

demo_events.js output (shortened):
  note 1: deleted=false, versions: v1 (block 2), v2 (block 4)
  note 2: deleted=true,  versions: v1 (block 3)
```
Mutation check (does a test notice a bug?): we temporarily made the function
ignore deletion events (`deleted = false`). Result: 2 passing, 1 failing
("rebuilds versions, order and deletion from events only"). After restoring: 24
passing again.

## Design notes and tradeoffs
1. **Why the strings in our events are not `indexed`.** An indexed field becomes
   a searchable topic, but an indexed string is stored only as its hash, so you
   could not read the text back. We want to read `"note"`, so it is not indexed.
   The `bytes32` variant (Step 09) indexes its key and could filter by record
   cheaply, but loses the readable type. Same tradeoff as in Step 10.
2. **Limit: reading all events scans the whole history.** Fine for a prototype
   with a handful of records. At scale, real systems use an indexer (a service
   that keeps events in a database) or batch anchoring (Phase 6).
3. **What this does and does not protect.** The event list tells us which records
   were anchored and their latest hash, from the chain alone. It does not stop an
   attacker holding the owner key from appending new anchors (PDF 10); it only
   makes sure they are visible.
4. **Python will mirror this.** In Task 5.3, `verify_all` will take its record
   ids from events (not `integrity_log`) so a deleted-row-plus-deleted-log attack
   still reports `MISSING_FROM_DB`.

## Concepts met in this step
Event log, `queryFilter`, event versus storage, indexer. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: trust the database table (`integrity_log`) for the list of records.
- Proper: rebuild the list from chain events.
- Tradeoff: the table is faster and trivial, but sits in the attacker's database.
  Events cost a chain scan but cannot be altered. For a project whose point is
  tamper evidence, we chose events.

## What I should be able to explain after this
(Write this yourself: what is the difference between storage and an event, and
why does reading the record list from events make deletion detection stronger?)
