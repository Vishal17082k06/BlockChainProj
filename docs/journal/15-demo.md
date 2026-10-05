# Step 15: The command-line demo

Date: 2026-10-05
Phase / Task: Phase 5, Task 5.4

## Goal
A single command that tells the whole story to a reviewer: create records,
tamper with them in several ways, and watch each attack get caught.

## How to run it
Prerequisite: `npx hardhat node` running in `blockchain/` and the contract
deployed (`npx hardhat run scripts/deploy.js --network localhost`).
```
cd python
.venv/Scripts/python.exe demo.py          # rolls the chain back at the end
.venv/Scripts/python.exe demo.py --keep   # leaves the anchors on the chain
```
If no node is reachable it exits with a clear message instead of a stack trace:
`Cannot run demo: Blockchain node not reachable at ...`.

## What we did
Wrote `python/demo.py`. It uses an in-memory SQLite database and the real local
chain. It takes a snapshot of the chain first and reverts at the end, so it can
be run any number of times from the same starting point.

## Output / evidence (real output)
```
1. Create three notes. Each is saved in the database and its hash anchored on-chain.
  created notes 1, 2, 3  (anchored: True, True, True)
  first proof: tx 0xeed85fbc2c7e5cb8... in block 2

2. Verify the untouched note.
  note 1, untouched                                -> VERIFIED

3. Someone edits note 1 directly in the database, bypassing the app.
  note 1 after silent edit                         -> TAMPERED

4. The app refuses to edit the tampered note (it would bless the forgery).
  refused: Update refused: record status is TAMPERED

5. A legitimate edit through the app on a clean note creates version 2.
  note 2 re-anchored as version 2
  note 2 after legitimate edit                     -> VERIFIED

6. Rollback attack: restore note 2's ORIGINAL text behind the app's back.
  note 2 restored to its version-1 text            -> TAMPERED

7. Someone silently deletes note 3, and also wipes the local integrity log.
  note 3 after silent delete                       -> MISSING_FROM_DB

8. Check everything at once (ids come from the chain's event logs).
  summary: {'TAMPERED': 2, 'MISSING_FROM_DB': 1}

9. Authorised delete through the app on a fresh note.
  note 4 after authorised delete                   -> DELETED_AUTHORIZED
```
Checks we ran: two consecutive runs gave identical output; the chain held no
anchors afterwards; the whole test suite still passes (43).

## What each step proves
| Step | What it shows | Why it matters |
|------|---------------|----------------|
| 1 | Hashes are anchored automatically on save | The proof exists from the moment of creation |
| 2 | Untouched record verifies | No false alarms on honest data |
| 3 | A direct database edit is detected | The core claim of the project |
| 4 | The app will not edit a tampered note | Otherwise a forged value would be re-anchored as the truth |
| 5 | A legitimate edit makes version 2 and stays valid | Honest changes are supported and history is kept |
| 6 | Restoring the old text is still TAMPERED | Only the latest version counts (rollback defence) |
| 7 | A silent delete AND a wiped local log is still caught | The chain, not the database, is the authority |
| 8 | `verify_all` finds the damage in one pass | Ids come from chain events, not the database |
| 9 | An authorised delete is recognised as legitimate | Deletion is allowed, silent deletion is not |

## Why the transaction hash was the same on both runs
`first proof: tx 0xeed85fbc...` appeared in both runs. A transaction's hash is
computed from who sent it, its sequence number (nonce) and its data. Rolling the
chain back to the snapshot resets the nonce, so run 2 sends the exact same
transaction as run 1. Not a bug. On a persistent chain (Sepolia, or `--keep`) the
nonce keeps rising and every hash is different. Note also that the record's
HMAC is deterministic: same note, same key, same hash.

## What this demo does NOT show (say this out loud in the viva)
- **Independence.** One local node, one machine, one owner key. Everyone in the
  story is controlled by the same person, so it demonstrates the mechanism, not
  independent trust (Step 03). A testnet (Phase 7) is the answer.
- **Prevention.** Nothing stops an edit; we only make it impossible to hide.
- **Accuracy.** A wrong note that was saved faithfully verifies as VERIFIED.
- **An attacker who holds the contract owner key** could append a new version for
  a forged record. The extra version would be visible on the chain, but not blocked.

## Concepts met in this step
End-to-end demo, repeatable test setup (snapshot/revert), nonce, deterministic
transaction hash. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: a persistent database file and chain, edited by hand in a SQL tool.
- Proper: an automated script on an in-memory database with a rolled-back chain.
- Tradeoff: the script is less "live" than pasting SQL into a tool, but it is
  identical every time and cannot go wrong on stage. For a live feel, run
  `demo.py --keep` and then type the tampering by hand (Phase 7 does this on a
  real testnet).

## What I should be able to explain after this
(Write this yourself: pick steps 3, 6 and 7 and say in your own words what the
attacker did and why the system still caught it.)
