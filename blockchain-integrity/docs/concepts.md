# Concepts

Plain-English definitions, added when we first meet each idea. Each entry says
where it came up (journal step) so you can find the context.

## Version control

- **Git branch**: a separate line of work. We use `feat/integrity-module` so
  `main` stays clean until the work is ready. (Step 01)
- **`.gitignore`**: a list of files git must never track. Secrets (`.env`),
  downloaded packages (`node_modules`) and generated files go here. (Step 01)

## Blockchain basics (filled in from Phase 1 onward)

- **Hash function**: takes any input and produces a fixed-size output (SHA-256:
  64 hex characters = 32 bytes). Same input always gives the same output; you
  cannot practically work backwards from output to input. (Step 02)
- **Avalanche effect**: changing one character of the input changes almost the
  whole hash (61 of 64 characters in our demo). This is why even tiny silent
  edits are detectable. (Step 02)
- **HMAC (keyed hash)**: a hash that also mixes in a secret key. Without the
  key nobody can reproduce it, so guessing short or predictable content from a
  published hash fails. Our module stores HMACs on-chain. (Step 02)
- **Canonicalisation**: converting a record into one exact, unambiguous text
  form before hashing (sorted keys, no extra spaces, fixed formats), so the same
  record always gives the same bytes and different records never collide by
  accident, e.g. (1,"23") vs (12,"3"). (Step 02)
- Block / chain:
- Node / consensus:
- Smart contract:
- Gas:
- ABI:
- Event:
- Merkle tree:
