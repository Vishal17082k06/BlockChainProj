# Step 21: A guarded deploy script, and what a read-only dry run on Sepolia taught us

Date: 2026-10-07
Phase / Task: Phase 7, Task 7.2 (first half of this entry). The wallet and the real
deployment are added below in later tasks.

## Goal
A deploy script that can target the real Sepolia network safely: it must show the
cost first, refuse the wrong network, and never overwrite our local files.

## What we did
- `blockchain/scripts/lib/deploy_contract.js`: shared deploy logic. Both
  `deploy.js` and `deploy_merkle.js` are now three-line wrappers around it.
- `blockchain/hardhat.config.js`: defines a `sepolia` network ONLY when
  `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` exist in `python/.env`. Local work
  never needs them. A key copied from MetaMask has no `0x` prefix; the config adds
  it if missing. `dotenv` is installed to read the file, with its startup banner
  silenced.
- `python/settings.py`: the same tolerance for the Python side (3 new tests: no
  `0x`, stray spaces, and a malformed key is rejected WITHOUT printing any part of
  it). Python suite: 82 passing.

## The guardrails in the deploy script
1. On any network other than local, it first checks the chain id is exactly
   Sepolia (11155111) and refuses otherwise.
2. It prints the network, the deployer address, the balance, the estimated gas and
   the estimated cost in ETH.
3. It then STOPS. Nothing is sent unless `CONFIRM_DEPLOY=yes` is set.
4. The in-process Hardhat network never writes a deployment file (a deployment on
   that throwaway chain would otherwise overwrite `deployment.json` with an address
   that exists nowhere and silently break the Python tests). Verified: the file was
   unchanged after an in-process run.
5. Local runs write `deployment.json`; Sepolia runs write `deployment.sepolia.json`.
   Each file now also records `deploymentBlock` (used to limit event queries).

## Local verification
```
npx hardhat test                               34 passing
in-process deploy                              no file written (checked by timestamp)
localhost deploy (both contracts)              files written, deploymentBlock = 3
--network sepolia with no Sepolia settings     HH100: Network sepolia doesn't exist
python suite after redeploy                    82 passed
```

## The read-only dry run on real Sepolia (no wallet, nothing sent)
To test the script before any real wallet existed, we ran the dry run with a
random, EMPTY key that lived only in that one command's memory, was never printed
or saved, and had no funds. It only asked the public server questions.

```
Network:        sepolia (chain id 11155111)
Balance:        0.0 ETH
Estimated gas:  6749626
Estimated cost: 0.0133842... ETH (at max fee 1.98 gwei)
Dry run only. Nothing was sent.
```
It proved: the public server is reachable, the chain id check works, the dry run
works and sends nothing.

## The surprise: 6,749,626 gas, when we had measured 964,347
Locally, deploying this exact contract used 964,347 gas (Step 10). Sepolia's
estimate was 7 times higher. I first suspected our script. A few read-only tests
showed the server itself reported it:

| Test | Local node | Sepolia server |
|------|-----------|----------------|
| deploy our contract | 964,347 | 6,749,626 |
| plain transfer (always at least 21,000 on old rules) | 21,001 | 12,000 |

and the same numbers came from an empty sender and a funded one, so the sender's
balance was not the cause.

**Cause (confirmed from several news and developer reports, not from our own
testing of the protocol): Ethereum's "Glamsterdam" upgrade activated on Sepolia on
2026-10-06 at 13:53 UTC, one day before this measurement.** It re-priced
operations that create permanent data:
- a new storage slot: 20,000 to about 97,920 gas;
- storing contract code: 200 to 1,530 gas per byte;
- creating an account or contract: 25,000/32,000 to about 183,600;
- the base cost of a plain transfer went DOWN (hence 12,000).
Our contract is about 3,700 bytes, so storing it alone is roughly 3,700 x 1,530 =
5.7 million gas, which matches the estimate. So the 6.7M estimate is CORRECT for
Sepolia today. My suspicion that the estimate was wrong was itself wrong; checking
saved us from "fixing" something that was not broken.

### What this means for the project
- **Our gas numbers (Steps 10 and 19) were measured on Hardhat's local chain,
  which still uses the OLD rules.** They are correct for those rules but do NOT
  predict Sepolia costs. Gas depends on the network's current hardfork. This is a
  genuine blockchain lesson, and it goes in the report.
- **Direction of the effect (a prediction to test, not a result):** anchoring writes
  new storage slots, which became about 4.4 times more expensive, so each anchor
  should cost several times more than 98,706 gas on Sepolia. That would make
  batching (fewer slots per record) look even better. We will MEASURE this in
  Task 7.5 and compare with the local numbers side by side.
- **Cost in test ETH is still tiny.** At about 2 gwei, deploying one contract is
  about 0.013 ETH. Both contracts plus a few demo transactions come to roughly 0.03
  ETH, so we recommend funding the wallet with at least 0.1 ETH. Gas prices move.
- **Never hard-code a gas limit.** Other projects broke on this exact day because
  they did. Our code asks the node for an estimate each time.
- **Per-transaction gas cap:** a single transaction can use at most about 16.7
  million gas (the local log shows "of 16777216"). Our deployment (6.7M) fits.

## The event-query limit, measured
Public servers limit how many blocks one event query may cover. We tested the
server we plan to use: 500, 2,000, 10,000 and 50,000 blocks were accepted;
200,000 was refused with `exceed maximum block range: 50000`. Our default of 2,000
blocks per request is safely inside that limit, which confirms the chunking design
from Step 20 was necessary.

## How reliable are free public servers? (also measured)
Of four free Sepolia servers tried, one worked, one rate-limited us (HTTP 429), one
returned an error, and one timed out. For a live demo, expect flakiness: keep a
backup server in mind, and do the real work before the day.

## Concepts met in this step
Hardfork, gas schedule changing by network version, state-creation gas, dry run,
estimated vs actual gas, public RPC rate limits. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: assume the gas numbers we measured locally apply everywhere.
- Proper: treat gas as a property of the network's current rules, and re-measure on
  the real network.
- Chosen: proper. It cost one extra check here and changed a conclusion we would
  otherwise have put in the report.

## What I should be able to explain after this
(Write this yourself: why did the same contract cost 964,347 gas locally and about
6.7 million on Sepolia, and what does that say about trusting gas numbers from a
local test chain?)
