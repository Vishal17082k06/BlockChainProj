# Step 26: The console on the real Sepolia testnet

Date: 2026-10-21
Phase / Task: Phase 7, Task 7.5 (through the Phase 8 console)

## Goal
Prove the whole story works on a real public network, not just the local simulation: anchor, edit,
tamper, detect, and delete, with real transactions that anyone can check.

## Safety
The user approved this run explicitly. It sent exactly 4 transactions from the throwaway test wallet
(balance 0.033379 test ETH before; the cost was negligible). The private key was never printed. The
tamper step is database-only and sends nothing.

## What was done (all through the browser console, network set to Sepolia)
| Step | Result |
|------|--------|
| Create note 1 | version 1, block 11,963,262, 356,566 gas, 22.5 s |
| Create note 2 | version 1, block 11,963,263, 356,566 gas, 11.7 s |
| Edit note 2 through the app | version 2, block 11,963,264, 258,646 gas, 8.7 s |
| Silent edit of note 1 in the Attack lab (database only), then Verify all | note 1 **Tampered**, Seal check "58 of 64 characters differ"; note 2 **Verified** |
| Delete note 2 through the app | recorded in block 11,963,267, 134,539 gas, 10.2 s; note then reads **Deleted (authorised)** |

## Independent check
The four receipts were fetched straight from the Sepolia node (not through the console): all
`status 1`, all sent to our IntegrityRegistry `0xF988...39Ca`, same blocks and gas as the console showed.
Each transaction has an Etherscan link in the console (`https://sepolia.etherscan.io/tx/<hash>`).

## Measurements
- Gas price that day: **18 wei**, so the 4 transactions cost about 0.00000000002 ETH in total.
  The earlier estimate of ~0.0005 ETH per anchor was far too high for these conditions; real cost
  depends on the day's gas price.
- Time is dominated by waiting for a block: 9 to 22 s per write. Verify all took about 8 s (many reads
  from a free public server); on the local chain it takes about 0.3 s.

## A bug this run found
The console showed the fee as "0 ETH" because the API rounds to 9 decimals and a few wei rounds to 0.
A mined transaction is never free, so fees that round to zero now display as "<0.000000001 ETH"
(test added first).

## What I should be able to explain
Why the same console works on both networks (one API, per-network contexts); why Sepolia is slower
(waiting for real blocks); why tampering is detected even though nothing was sent to the chain
(the chain still holds the old fingerprint).
