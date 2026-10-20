# Step 20: Signing transactions, and a guardrail against the wrong network

Date: 2026-10-07
Phase / Task: Phase 7, Task 7.1

## Goal
Prepare the Python code to talk to a REAL public network (Sepolia) safely, while
everything still runs on your own laptop. No wallet, no real network, no cost.

## Why this step exists: "who sends the transaction?"
Writing to a blockchain means sending a **transaction**: a message saying "call
this function of this contract." The network must know WHO sent it, because only
the contract's owner may anchor hashes.

- **On our local node**, the node is helpful and lets us act as one of its 20 test
  accounts without proving anything. Our code just says "send as account 0" and
  the node signs for us. That only works because the node is on our own laptop and
  holds those keys.
- **On a real network** no such helper exists. Nobody else holds our key, so WE
  must **sign** the transaction ourselves with a **private key**. Signing is like
  signing a cheque: the signature proves the owner of the account approved it,
  without revealing the key. The signed transaction is then handed to any node,
  which passes it on.

Terms in plain English:
- **Private key**: a long secret number. Whoever has it controls the account.
- **Address**: the public name of an account, derived from the key. Safe to share.
- **Sign**: produce a signature from the private key that proves approval.
- **Nonce**: a counter of how many transactions the account has sent. It stops the
  same signed transaction being replayed.
- **Gas fee fields**: how much we are willing to pay per unit of work. The library
  fills these in for us from the network's current prices.

## What we did
Test first: wrote 12 tests (8 in `tests/test_signing.py`, 4 in
`tests/test_settings.py`) and ran them: `ImportError: cannot import name
'WrongNetwork'` (expected). Then changed:
- `python/chain.py`: a new `_send` helper. With no key it behaves as before (dev
  node's unlocked account). With a key it builds the transaction, signs it locally,
  sends the signed bytes, and waits for the receipt. `anchor` and `mark_deleted`
  now both use it.
- `python/merkle_chain.py`: uses the same `_send`.
- `python/settings.py`: `profile("local")` and `profile("sepolia")` bundle the
  connection settings for each network.
- `Chain.for_network("sepolia")` builds a ready-to-use chain for that profile.

The tests sign with Hardhat's PUBLIC test keys (the same ones printed in your
node window). Those keys are known to everyone and hold only fake money, so using
them in tests is safe, and it proves the signing code works end to end WITHOUT
needing a real wallet.

## Output / evidence
```
Before:  ImportError: cannot import name 'WrongNetwork'
After:   12 passed (new);  whole Python suite 79 passed (67 + 12)
```
Two things I was unsure about turned out fine: the signed object's attribute is
named `raw_transaction`, and a signed transaction from a NON-owner account is
rejected with `ContractLogicError` (the contract's own "Not authorized"), which
shows the owner rule still holds when transactions are signed.

## The safety guardrail
A private key can sign for ANY network. The same key that works on a test network
would also work on the real Ethereum network, where gas costs real money. So the
code refuses to sign unless the network is on an approved list:

- `ALLOWED_SIGNING_CHAIN_IDS = {31337, 11155111}` = our local chain and Sepolia.
- A **chain id** is a number that identifies a network (Ethereum mainnet is 1).
  `Chain.connect()` asks the node which chain it is and raises `WrongNetwork` if the
  id is not on the list, BEFORE any transaction is built.
- Tests: signing is refused when the id is not allowed; and the number `1`
  (mainnet) must never appear in the allowed set.

This is one of several protections. Later we also use a brand-new wallet that has
never held real money, so even if every check failed, nothing real could be spent.

## A second problem found while designing: reading events on a public network
Our `anchored_records()` used to ask for events "from block 0 to now." That is
fine on a local chain with a handful of blocks. On Sepolia there are millions of
blocks, and free public servers refuse queries that cover too many (they limit
the range). So:
- the deploy script will record the **deployment block**, and queries start there;
- queries run in **chunks** (default 2,000 blocks per request, `LOG_CHUNK`).
Two tests cover this: results are identical when forced into 1-block chunks, and
a deployment block placed after every anchor returns nothing.
We have NOT yet seen what block range a real Sepolia server allows; if a request
is refused we will lower `LOG_CHUNK` and record the working value (Task 7.5).

## Mutation checks (we broke the code on purpose; each change confirmed applied)
| Bug introduced | Test that caught it |
|----------------|---------------------|
| network guardrail removed | `test_signing_is_refused_on_an_unapproved_network` |
| mainnet added to the approved list | `test_mainnet_is_never_in_the_approved_set` |
| signing key ignored (always use the unlocked account) | `test_signed_transaction_from_a_non_owner_is_rejected` |
| event queries always start at block 0 | `test_event_queries_start_at_the_deployment_block` |

## A mistake of mine worth recording
For the mutation checks I rewrote `chain.py` five times with PowerShell 5.1's
`Set-Content -Encoding utf8`, which silently adds an invisible byte-order mark
(three hidden bytes `EF BB BF`) to the start of the file. The tests still passed
(Python tolerates it) and my "is it restored?" check passed too (PowerShell hides
the mark when reading), so nothing flagged it. I only found it by looking at the
raw first bytes. I removed the mark and confirmed the file starts with plain text
again. Lesson: "the tests pass" does not prove a file is byte-for-byte what you
intended; check the bytes when you rewrite files with a tool that re-encodes.

## What this step does NOT do
No wallet exists yet, nothing touches Sepolia, and no key of yours is involved.
The guardrail and signing are proven only against the local chain.

## Concepts met in this step
Transaction signing, private key vs address, nonce, chain id, replay protection
(the purpose of a nonce and chain id), allow-list guardrail, log-range limits and
chunking, byte-order mark. (See `docs/concepts.md`.)

## Simple vs "proper" choice
- Simple: keep using the node's unlocked account everywhere.
- Proper: sign locally with a key, which is the only way a real network accepts us.
- Kept both: the unlocked-account path stays as the default for local work (no key
  needed), and signing is used only when a key is supplied.

## What I should be able to explain after this
(Write this yourself: why can't we just "send as account 0" on Sepolia, what does
signing a transaction prove, and why does the code check the chain id before it
signs anything?)
