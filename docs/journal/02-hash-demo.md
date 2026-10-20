# Step 02: Hash demo (SHA-256, HMAC, canonical form)

Date: 2026-10-05
Phase / Task: Phase 1, Task 1.1

## Goal
Understand, by running it, the three ideas the whole module rests on: hashing,
keyed hashing (HMAC), and canonical serialisation.

## Why this step exists
Everything later (the contract, the verification logic) assumes you trust these
three ideas. If a hash is just a magic word to you, the rest will feel like
magic too. Here we see each property happen.

## What we did
Wrote `experiments/hash_demo.py` (standard library only) and ran
`python hash_demo.py`.

## Output / evidence
```
Characters that differ: 61 of 64
Same input twice gives the same hash: True
A very short and a very long input both give 64 and 64 hex characters
Plain SHA-256 of a short, guessable note: 8a79...9d3d
  Attacker guessed it: the note was 'yes'
Naive join: '123' vs '123' -> same hash? True
Canonical JSON: {"content":"23","interactionid":1} vs {"content":"3","interactionid":12} -> same hash? False
```
Both doctor-appointment hashes (`f44e6692...` and `c0c6601d...`) match the
values printed in the PDF (section 3.1), so our environment computes SHA-256
the same way the report's build script did.

## What each part showed
1. **Avalanche effect.** Changing one character (`10:00` to `10:30`) changed 61
   of 64 hash characters. So even a tiny silent edit to a record produces a
   completely different fingerprint. That is why comparing hashes detects
   tampering reliably.
2. **Fixed size and determinism.** A 1-character input and a 100,000-character
   input both give 64 hex characters (256 bits = 32 bytes, which fits a
   Solidity `bytes32`). The same input always gives the same hash, which is what
   lets us recompute later and compare.
3. **Plain hash is guessable.** For a short, predictable note ("yes") an
   attacker who sees the hash can hash likely guesses until one matches. Our
   script did exactly that and recovered the note. An HMAC mixes in a secret
   key, so without the key the attacker cannot reproduce the value.
4. **Naive joining is ambiguous.** Record (1, "23") and record (12, "3") both
   become `"123"` and so hash identically. Two different records with the same
   hash would let one be swapped for the other undetected. JSON with named
   fields and delimiters keeps them apart.

## Concepts met in this step
Hash function, avalanche effect, HMAC, canonicalisation (added to
`docs/concepts.md`).

## Simple vs "proper" choice
- Simple: hash the record with plain SHA-256.
- Proper: HMAC-SHA256 over canonical JSON.
- Tradeoff: HMAC needs a secret key to manage (lose it and old records can no
  longer be re-verified, PDF 7.3). In return the hashes put on a public
  blockchain reveal nothing, even for guessable content. Because the chain data
  is permanent and public, we pay the key-management cost.

## What I should be able to explain after this
(Write this yourself in 3-4 sentences: why can a hash detect a silent edit,
and why do we use HMAC and canonical JSON instead of a plain hash of joined text?)
