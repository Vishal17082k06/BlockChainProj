# Step 25: The Witness console interface

Date: 2026-10-21
Phase / Task: Phase 8, Tasks 9.1 to 9.9

## Goal
A browser console you can demo: create notes, tamper with the database, and watch the chain catch it,
with real transaction hashes and block numbers on screen. It should look designed for this project, not
like a generic dashboard.

## Concepts, in plain words
- **Component**: a small, reusable piece of screen (a ledger row, the progress card) with its own
  code, style and tests.
- **State**: what the screen remembers right now (which note is selected, whether a write is running).
  When state changes, React redraws only what depends on it.
- **Reducer**: a plain function `(old state, event) -> new state`. The progress card is a reducer fed by
  the API's real stage events, so it can only show what truly happened.
- **Design tokens**: named values (colours, sizes) in one file, so the whole look can be changed or checked in one place.
- **Accessibility (a11y)**: the screen works with a keyboard and a screen reader, and text is readable.
  Contrast is a number (WCAG ratio); 4.5 to 1 is the pass mark for normal text.

## What we built
- Logic first, tested with no UI: API client, stream reader, stage reducer, hex diff, activity lines.
- The screen: header with network switch and live block number, ledger of notes with status, inspector
  (note text, the **Seal check**, history on the chain, edit / delete / Attack lab), composer, progress
  card, summary bar with Verify all, activity tape, and the dark **Attack lab** drawer.
- **Seal check** (the signature element): the fingerprint the chain remembers and the one the database
  now produces, drawn as two aligned rows with every differing character highlighted ("63 of 64 characters differ").

## Tests
Frontend: 162 tests (was 0); includes ChainPulse. Python 165 and Hardhat 34 still pass. Mutation checks (break the code on purpose,
confirm a test fails): removing `key={network}` fails 2 tests; removing the Escape listener fails 1.

## Bugs found by running it for real (and fixed)
1. **`shortHash(hash, 8, 0)` returned the whole hash.** `slice(-0)` means "from the start", not "last 0".
   The progress card printed the fingerprint twice, overflowing its column. Test added first, then the fix.
2. **Escape did not close the Attack lab** after running an attack. The Run button becomes disabled while
   running, so the browser moves focus to the page and the dialog never hears the key. Fixed with a
   document-level listener and focus returned to the button; test covers it.
3. **State leaked across networks.** After switching to Sepolia the progress card still showed the Local run
   (labelled "on Sepolia") and the Local "checked just now". Fixed by moving per-network state into
   `Workspace`, keyed by network; two integration tests guard it.
4. **The ledger waited for Sepolia.** `/api/networks` takes about 1.5 s because it asks Sepolia's public
   node. The ledger now starts at once (0.5 s) and is held back only if the check says the network is unusable.
5. **Low contrast**: the "faint" grey was 3.2 to 3.4 : 1 for small text. Darkened to 4.6 to 4.9 : 1.
6. **Duplicate copy**: a deleted note said the same sentence twice in the inspector. Reworded.
7. The inspector's action buttons scrolled out of view on a 900 px screen. They are now pinned to the
   bottom of the panel.

## What we verified end to end (Local chain)
Create notes; silent edit shows **Tampered** with the Seal check lit; edit of a tampered note is refused by
the module with a clear message; silent delete shows **Missing from database** (ghost row, history still
readable); edit then roll back with covered tracks is still caught (60 of 64 characters differ); Verify all;
Escape and Tab behaviour; no console errors; no horizontal scroll on a 390 px phone. Sepolia was only
opened read-only: no transaction was sent to it.

## Simple vs proper
- Plain CSS Modules instead of a UI kit: more writing, but a distinctive look and no unused code.
- Polling a cheap `/pulse` endpoint instead of websockets: simpler, and fine for a demo.
- Not done on purpose: dark mode, a mobile-specific layout beyond a slide-over inspector, e2e tests in CI
  (the walkthrough was run by hand with a headless browser).

## Next
Phase 9: report and viva material.
