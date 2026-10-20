# Step 23: Both contracts are live on Sepolia

Date: 2026-10-20
Phase / Task: Phase 7, Tasks 7.3 and 7.4 (done by you in Remix with MetaMask; verified and
connected here)

## What happened
You deployed `IntegrityRegistry` and then `MerkleRegistry` from Remix using the new
MetaMask wallet. We then verified both from the chain itself (read-only) and connected
them to our Python code.

| | Address | Creation transaction | Block |
|---|---|---|---|
| `IntegrityRegistry` | `0xF9885ec5865f1DeE480825eeB3a56F461D2439Ca` | `0x69acef310151fcb7568e6869671c97b42ab43d89c83e5740abe99c6271376a43` | 11953418 |
| `MerkleRegistry` | `0xf69E23742D71E9d3dC67bb3fbc892f30080faE98` | `0x5e8aa68382b32ad40ae7f39c7f93d49604b29a64dee1ec71c4a43bc867a48bf4` | 11953472 |

Look them up at `https://sepolia.etherscan.io/address/<address>`.
Deployer and owner of both: `0x4f10E2c6b717fbD2666467FF4834dFfbDC2bD788` (the new
throwaway wallet). Deployed 2026-10-20, about 06:10 UTC.

## Verification (all read-only, nothing was sent by us)
- **The addresses matched our prediction exactly.** In Step 22 we predicted
  `0xF9885...` and `0xf69E2...` from the wallet address and its transaction count.
  Both were right, which confirms the wallet's first two transactions were these
  deployments.
- **The code is ours.** `check_deployment` stripped the metadata and compared the code on
  the chain with our compiled contracts byte for byte: `MATCHES our compiled code` for
  both. This also confirms the Remix settings (EVM `paris`, optimizer off) were applied
  correctly.
- **`register_deployment` passed all four checks:** right network (11155111), code is
  ours, the given transaction created that exact address and succeeded, and the owner
  equals the wallet whose key is in `python/.env`.
- **Our Python code reads them on the real network:** it connected, passed the network
  guardrail, returned the owner, found `note 1` unanchored (version 0), found no
  anchored records (event logs queried in chunks from the deployment block), and found
  0 Merkle batches.
- **The wallet has sent exactly 2 transactions** (nonce 2), both deployments. Nothing has
  been anchored yet.

## What it really cost (measured from the receipts)
| | Gas used | Gas price | Fee | Dry-run estimate | Local (Hardhat) gas |
|---|---|---|---|---|---|
| `IntegrityRegistry` | 6,695,317 | 1.5 gwei | 0.010043 ETH | 6,749,626 gas | 964,347 |
| `MerkleRegistry` | 4,385,578 | 1.5 gwei | 0.006578 ETH | 4,421,568 gas | 641,916 |
| **Total** | | | **0.016621 ETH** | | |

Wallet: started with 0.05, now 0.033379. The numbers reconcile exactly.

What these show:
1. **The dry-run GAS estimates were accurate** (within 1%: 6,749,626 vs 6,695,317 and
   4,421,568 vs 4,385,578). The estimate was right to trust.
2. **The dry-run COST estimates were too low, because the price moved.** We estimated
   0.0035 ETH for `IntegrityRegistry` at 0.52 gwei; it was paid at 1.5 gwei, 2.9 times
   higher, giving 0.010 ETH. Gas is a number of units (stable) multiplied by a price per
   unit (floating). The guide I wrote said "about 0.006 ETH for both"; the real total was
   0.0166. That was my error, and the guide is corrected.
3. **Sepolia costs about 6.9 times more to deploy than the local chain, for both
   contracts** (6,695,317 / 964,347 = 6.94; 4,385,578 / 641,916 = 6.83). The cause is the
   re-pricing in Step 21: storing code now costs 1,530 gas per byte. `IntegrityRegistry`
   has about 4,126 bytes of code, and 4,126 x 1,530 is about 6.3 million, which accounts
   for most of the 6.7 million. (This is arithmetic from the published prices applied to
   our code size, consistent with the measurement; it is not a separate measurement.)
4. Both were paid from a wallet that now holds 0.033 ETH. That is enough for the next
   step (the demo on Sepolia), but not unlimited: gas is spent on every write.

## "Do I need to stop it? Will it keep charging me?"
No and no.
- **A deployed contract is not a running program that you pay to keep alive.** It is data
  stored on the network. Nobody charges you for it to exist, and there is nothing to stop.
  Closing Remix or MetaMask does nothing to it.
- **You only pay when YOU send a transaction that changes something** (deploying,
  `anchorHash`, `anchorRoot`, `markDeleted`). Reading (`verify`, `getLatest`,
  `versionCount`, `getBatch`) is free.
- **It is test money.** SepoliaETH has no value, so even the fees you pay cost nothing
  real. The wallet never held real money.
- What you CAN stop: the local Hardhat node on your laptop (Ctrl + C) and any faucet
  mining tab. Neither costs money; they just use your computer.
- A deployed contract cannot be edited or removed. To change it you deploy a new one.
- Caveat for the future: test networks are not forever. Older ones (Goerli, Holesky) were
  shut down. Sepolia is long-lived but not guaranteed. For the viva, keep the transaction
  hashes, the Etherscan links and screenshots of the pages, in case the network is ever
  retired.

## Concepts met in this step
Contract deployment on a public testnet, gas used vs gas price vs fee, effective gas
price, nonce-based address prediction (confirmed), block explorer, ownership, why a
deployed contract does not "run" or accrue charges, archive vs non-archive nodes (see
below). (See `docs/concepts.md`.)

## A limitation found while auditing
We tried to find the creation transactions by asking the public server what code existed
at each earlier block. It refused: `historical state ... is not available`. Free public
servers keep only recent state (they are not "archive" nodes). We found the second
transaction by scanning blocks forward from the first instead, which worked because the
two deployments were only 54 blocks (about 11 minutes) apart. If a design ever needs old
state, it needs a paid archive node or an explorer API.

## Simple vs "proper" choice
- Simple: deploy by hand in Remix (what you did).
- Proper: deploy by script (Hardhat), repeatable and reviewable.
- Chosen: Remix, by your decision, with our own tools verifying the result. The Hardhat
  route stays available as a fallback and for any future redeployment.

## What I should be able to explain after this
(Write this yourself: why do I not need to "stop" a deployed contract, when exactly do I
pay, and why was the real fee almost three times my first estimate even though the gas
estimate was accurate?)
