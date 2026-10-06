# Step 10: Measuring gas

Date: 2026-10-05
Phase / Task: Phase 4, Task 4.2

## Goal
Measure what our contract costs to use, and compare the PDF's `string` design
with the `bytes32`-key variant using real numbers.

## Concept: what is gas?
Every operation a blockchain performs is metered. **Gas** is the unit of that
work: writing a value to storage costs a lot of gas, adding numbers costs very
little, reading costs nothing when done off-chain. On a real network you pay
`gas used x gas price` in the network's currency, which is where the real cost
comes from. On our local chain gas is free, but the amounts used are still real
and identical in nature, so we can compare designs now.

## What we did
Wrote `blockchain/scripts/measure_gas.js`. It deploys both contracts on
Hardhat's built-in in-process chain (no node needed, our deployed contract is
untouched), performs the same operations on each, and reads `receipt.gasUsed`
from each transaction. We used receipts rather than the `hardhat-gas-reporter`
plugin because the numbers are exact and the method is simple to explain.

## Output / evidence (identical on two separate runs)
| Operation | string design (gas) | bytes32 design (gas) | difference |
|---|---|---|---|
| deploy contract | 964347 | 566105 | 398242 |
| anchor, first version (type 'note') | 98706 | 96378 | 2328 |
| anchor, second version (same record) | 81606 | 79278 | 2328 |
| anchor, first version (long type 'calendarevent') | 98814 | 96378 | 2436 |
| markDeleted | 52519 | 50215 | 2304 |

## What the numbers tell us

1. **Storage dominates the cost.** A first anchor writes three fresh storage
   slots (the list's length, the hash, the timestamp). Under Ethereum's gas
   schedule a zero-to-non-zero slot write costs 22,100, so 3 x 22,100 = 66,300,
   plus 21,000 base cost for any transaction, makes up roughly 90% of ~96-99k.
   The remaining ~10% is calldata, hashing, the event and bookkeeping. This is
   exactly why the PDF stores only a 32-byte hash and no data (PDF 3.6, 5.1).
2. **Second version is cheaper than the first by exactly 17,100.** That equals
   22,100 - 5,000: the list length slot is zero-to-non-zero on the first anchor
   but only non-zero-to-non-zero (5,000) afterwards. Our hypothesis, made before
   measuring, was right and the arithmetic confirms it.
3. **The `bytes32` key saves only about 2,300 gas per call (2.4%).** My guess was
   "likely cheaper" and it is, but the saving is small because the expensive part
   (storage) is the same in both designs.
4. **Longer type names cost slightly more in the string design.** `calendarevent`
   vs `note` costs 108 more: 9 extra characters x 12 gas (a non-zero calldata byte
   costs 16 gas, a zero padding byte 4). Negligible. The `bytes32` design is
   identical for both, as expected, because the key is always 32 bytes.
5. **Deploying costs 41% less for the variant, but this is NOT a fair
   comparison.** The variant has fewer functions (no `getLatest`, no
   `getVersion`) and smaller events, so part of that gap is missing features, not
   the key design. Deployment is also a one-time cost.

Caveats: the per-call difference mixes three things, not just the key
encoding: string calldata, on-chain `abi.encode` and hashing, and the longer
event (which contains the string). Gas constants quoted here are from my
knowledge of the Ethereum gas schedule and match the measurements; confirm them
in the Ethereum docs (ethereum.org/en/developers/docs/gas) before quoting in the
report. We do not convert gas to money: that needs a real gas price, which we
get from Sepolia in Phase 7.

## Decision (simple vs "proper")
- Simple: keep the PDF's `string` design. 2.4% more gas per anchor, readable
  record type in events and on block explorers.
- Proper: switch to `bytes32` keys. Slightly cheaper, but callers must compute
  the key identically everywhere, and events lose the readable type.
- **Chosen: keep the `string` design.** A 2.4% saving does not justify the lost
  readability and extra coupling. The bigger lever is not the key format but
  writing fewer storage slots per record, which is what Merkle batching
  (Phase 6) does: one root for many records. Hypothesis to test there: gas per
  record drops by far more than 2.4%.

## Concepts met in this step
Gas, gas used vs gas price, storage-write cost, calldata cost, transaction base
cost (21,000). (See `docs/concepts.md`.)

## What I should be able to explain after this
(Write this yourself: why is it expensive to write to a blockchain but free to
read, and why does the PDF store only a hash instead of the whole record? What
decision did we make about string vs bytes32 and why?)

## UPDATE 2026-10-07: these numbers are for the OLD gas rules
Everything above was measured on Hardhat's local chain. On 2026-10-06 Sepolia
activated the Glamsterdam upgrade, which re-priced state creation (a new storage
slot went from about 22,100 to about 97,920 gas; contract code from 200 to 1,530
gas per byte). The arithmetic in this entry is correct for the old rules but does
NOT predict Sepolia. We re-measure on Sepolia in Task 7.5. See Step 21.
