# Step 19: Merkle gas comparison and demo

Date: 2026-10-05
Phase / Task: Phase 6, Task 6.4

## Goal
Measure how much gas Merkle batching saves compared with one transaction per
record, and demonstrate batching end to end.

## What we did
- `blockchain/scripts/measure_merkle_gas.js`: for N = 1, 10, 100 it makes N
  separate `anchorHash` calls on a fresh `IntegrityRegistry` and ONE `anchorRoot`
  call on a fresh `MerkleRegistry`, and reads `gasUsed` from each receipt.
  Fresh contracts each time, so every anchor is a "first write" and the
  comparison is like for like. For N = 1000 and 10000 only the single root is
  measured (the matching one-per-record runs would take thousands of
  transactions and were NOT measured).
- `python/merkle_demo.py`: builds a tree over 8 notes, anchors the root with one
  transaction, proves one note, tampers with it, and shows it fail in both
  Python and the contract.

## Output / evidence (identical on two runs)
| Records (N) | one tx per record: total gas | one Merkle root: gas | per record: single | per record: Merkle | saving | proof size |
|---|---|---|---|---|---|---|
| 1 | 98706 | 115809 | 98706 | 115809 | -17% | 0 hashes (0 bytes) |
| 10 | 987048 | 115809 | 98704 | 11580 | 88% | 4 hashes (128 bytes) |
| 100 | 9870384 | 115785 | 98703 | 1157 | 98% | 7 hashes (224 bytes) |

| Records (N) | one Merkle root: gas | per record |
|---|---|---|
| 1000 | 115821 | 115 |
| 10000 | 115821 | 11 |

(Percentages are rounded down by the script. Exact: N=10 saves 88.3%, N=100
saves 98.8%.)

Demo output:
```
2. Anchor the single root: ONE transaction covers all 8 notes.
  batch 0, block 3, gas used 115809
3. To prove note 3 we need only 3 sibling hashes (96 bytes), not the other notes.
4. note 3, untouched            python: VERIFIED  | contract: VERIFIED
5. note 3 after silent edit     python: TAMPERED  | contract: TAMPERED
```
The demo's 115,809 gas matches the table's single-batch cost, a free
consistency check between the two programs.

## What the numbers tell us
1. **The Step 10 hypothesis held.** We predicted batching would save "far more
   than 2.4%" per record (the `bytes32` key change). Measured: 88% at N = 10 and
   98.8% at N = 100.
2. **It is NOT cheaper at N = 1.** One batch of one record costs 115,809 versus
   98,706 for a plain anchor: 17% more. A batch stores one more value (the count)
   than a single anchor stores, and a new storage slot costs about 22,100 gas;
   that is consistent with the 17,103 gas gap, with roughly 5,000 recovered
   elsewhere. We did NOT isolate where that 5,000 comes from, so treat the
   explanation as "consistent with", not proven. From the table, N = 2 would
   already be cheaper (two single anchors cost about 197k, more than 115.8k),
   though N = 2 was not measured.
3. **A root costs the same however many records it covers.** 115,785 to 115,821
   gas for N from 1 to 10,000: a spread of 36 gas (0.03%). The spread is probably
   calldata: a zero byte costs 4 gas and a non-zero byte 16, and each root and
   count has different bytes. That cause is an inference, not measured.
4. **Per-record cost falls roughly as 1/N.** 115,809 divided by N: 11,580 gas per
   record at N = 10, 1,157 at N = 100, 115 at N = 1,000, 11 at N = 10,000.
5. **A proof grows slowly.** 3 hashes (96 bytes) for 8 records, 7 hashes (224
   bytes) for 100. It needs about log2(N) hashes, so doubling the batch adds one.

What these numbers do NOT include: the cost of building the tree and storing the
leaves and proofs off-chain (cheap but not free), and any gas price. Real cost is
gas used times gas price. On the local chain it is free; Phase 7 (Sepolia) gives a
real price and we will state it from that measurement, not from an assumption.

## The tradeoffs (cost versus granularity, PDF 11)
| Per-record anchoring | Merkle batching |
|----------------------|-----------------|
| ~98.7k gas per record | ~1/N of one root's cost per record |
| each record's hash is on-chain, can be read directly | only a root is on-chain; you need the leaf and a proof |
| the chain records every edit as a version, only the latest counts | no latest-version rule: an old batch still proves old content (Step 18's test) |
| anchored immediately on save | anchored when a batch is full or on a timer: a longer window in which a record could change before it is anchored |
| editing a record = one new anchor | editing a record = a new leaf in a future batch |
| nothing extra to store | must keep every batch's leaf list (to rebuild proofs); lose it and records in that batch cannot be proven individually |

The accurate summary: Merkle batching is the right tool when anchoring many
records that are not edited afterwards (logs, audit trails), and per-record
anchoring is the right tool for a small number of important records that are
edited. For this project (a few notes, calendar events, conversation summaries
per day), per-record anchoring is adequate and gives stronger guarantees, so
batching is presented as a scaling option and implemented as a proof of concept.

## Concepts met in this step
Gas amortisation, break-even point, cost per record, proof size growth. (See
`docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: one transaction per record.
- Proper at scale: Merkle batching.
- Chosen for the main module: simple (per-record). Reason: the dataset is small,
  and per-record anchoring keeps the rollback defence and immediate anchoring.
  Batching is implemented separately to show we understand the scaling answer.

## What I should be able to explain after this
(Write this yourself: at roughly how many records does batching start to pay
off, why does it cost more at N = 1, and why would you not simply batch
everything?)
