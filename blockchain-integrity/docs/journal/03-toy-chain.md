# Step 03: Toy blockchain

Date: 2026-10-05
Phase / Task: Phase 1, Task 1.2

## Goal
Build a minimal blockchain ourselves and see exactly how tampering is detected,
and exactly when it is NOT.

## Why this step exists
Our project stores hashes on a blockchain and claims "tamper-evident". Before
using a real one (Hardhat/Ethereum), we need to know what a blockchain gives us
beyond a single hash, and what its limits are. Our PDF's biggest limitation
(section 10) is that a local chain is only a simulation. This experiment shows
why.

## What we did
Wrote `experiments/toy_chain.py`:
- Each block holds `index`, `timestamp`, `data`, `prev_hash`, `nonce`, `hash`.
- A block's hash covers all its fields (including `prev_hash`).
- Proof-of-work: a valid hash must start with four zeros, found by trying
  `nonce` values (about 10,000-130,000 tries per block here).
- `validate()` checks three things per block: stored hash matches contents,
  proof-of-work is present, and `prev_hash` equals the previous block's hash.

## Output / evidence
```
1. valid chain                       -> (True, None)
2. edit block 2's data               -> (False, 'block 2: stored hash does not match its contents')
3. attacker re-mines block 2         -> (False, 'block 3: prev_hash does not match block 2')
4. attacker re-mines blocks 2,3,4    -> (True, None)
```

## What each stage showed
1. **Edit is detected (stage 2).** Changing the data changes the block's hash,
   so the stored hash no longer matches. This is the same idea as our module's
   record-versus-chain hash comparison.
2. **Chaining spreads the damage (stage 3).** Even if the attacker fixes block
   2's own hash, block 3 contains block 2's OLD hash, so the link breaks. Every
   block after the edit would also have to be redone.
3. **Proof-of-work makes redoing it costly (stages 3-4).** Each block needed
   tens of thousands of hash attempts. Redoing many blocks means redoing all
   that work, and on a real network the honest nodes keep adding blocks, so the
   attacker must outpace them.
4. **But one copy can be rewritten (stage 4).** With no other copies to compare
   against, the attacker rebuilt the whole chain and it validated. Tamper
   evidence is only as strong as the independence of the copies.

## Link to our project
- Our contract on a local Hardhat node is like stage 4: one machine, one
  operator. It demonstrates the mechanism but not the full trust guarantee.
  This is the honest answer to "is it really decentralised?" (PDF 10, 12.2).
- A public testnet (Phase 7) is many independent nodes, so it is the real
  version of "the honest majority would reject the rewrite".
- Ethereum today uses proof-of-stake, not proof-of-work. We used proof-of-work
  here only because it is the simplest way to see "making a block costly".

## Concepts met in this step
Block, chain, nonce, proof-of-work, node, consensus (added to
`docs/concepts.md`).

## Simple vs "proper" choice
- Simple: toy chain with proof-of-work, one process, no network.
- Proper: a real network with consensus (proof-of-stake on Ethereum) and
  thousands of nodes.
- Tradeoff: the toy is easy to read in one sitting but proves nothing about
  trust; the real network is where trust comes from and is far more to set up.
  We use the toy to learn and Hardhat/testnet to build.

## What I should be able to explain after this
(Write this yourself: why does editing an old block break every later block,
and why could we still rewrite the whole toy chain? What fixes that in a real
blockchain?)
