# Deploying to Sepolia with Remix and MetaMask

A step-by-step guide. Every value, setting and expected result here was checked
before it was written (see "How this guide was checked" at the end).

**Time:** about 20 minutes. **Cost:** about 0.006 test ETH for both contracts at
today's prices (free test money; prices move). **Nothing here can touch real money**
as long as you use the new wallet and stay on the **Sepolia** network.

---

## 0. Before you start (checklist)

- [ ] MetaMask installed from `metamask.io`, with the **new wallet** (never held real money).
- [ ] MetaMask is switched to **Sepolia** (the network name at the top-left says Sepolia).
- [ ] The wallet holds test ETH. Yours had **0.05 SepoliaETH** (checked).
- [ ] You can open Remix at `https://remix.ethereum.org` in the same browser.

What you are about to send is public and permanent: the contract code and your wallet
address will be visible on a block explorer forever. Neither contains personal data.

---

## 1. Practice first with no wallet (optional, risk-free)

In Remix, "Remix VM" is a pretend blockchain inside the page. You can follow sections
2, 3 and 5 with it first. Choose it in **Environment** instead of MetaMask. Nothing is
sent anywhere. You will probably see a much smaller "gas used" for deployment than on
Sepolia, for the reason explained in `docs/journal/21-sepolia-deploy.md`.

---

## 2. Put our contract into Remix

1. In VS Code open `blockchain\contracts\IntegrityRegistry.sol`. Press **Ctrl + A**,
   then **Ctrl + C**.
2. In Remix, in the **File explorer** (left), click the "create new file" icon. Name it
   exactly `IntegrityRegistry.sol`. Paste the code. Save (Ctrl + S).
3. Repeat for `blockchain\contracts\MerkleRegistry.sol` (name it `MerkleRegistry.sol`).

Use only those two files. Do **not** use anything from `contracts\experimental\`.

## 3. Compile with the EXACT settings below

Open the **Solidity compiler** tab (left toolbar).

| Setting | Value | Why |
|---------|-------|-----|
| Compiler | **0.8.24** | the version our project uses |
| Language | Solidity | |
| **EVM Version** | **paris** (open "Advanced Configurations" to change it) | Remix defaults to a newer one that produces different code |
| **Enable optimization** | **unticked (off)** | our build has it off |

Click **Compile IntegrityRegistry.sol**, then compile `MerkleRegistry.sol`. You should
see a green tick on the compiler icon and no red errors. (Yellow warnings are fine.)

Why these settings matter: we later check that the code on the chain is **exactly** our
compiled contract. We tested this: with `paris` and optimization off, Remix's compiler
engine produces the same code as ours for both contracts. With Remix's default EVM
version, or with optimization on, the code differs, and our checking tool would say
"DOES NOT MATCH".

## 4. Deploy

Open the **Deploy & run transactions** tab.

1. **Environment:** choose **Injected Provider - MetaMask**. MetaMask pops up asking to
   connect. Choose your new wallet account and confirm.
2. Remix now shows the network under the dropdown. It MUST read **Sepolia (11155111)**.
   If it shows anything else, **stop** and switch the network in MetaMask.
3. **Account** shows your address, `0x4f10…D788`, and your balance.
4. **Gas limit (important):** Remix's default has historically been **3,000,000**, which
   is too low now. Deploying needs about **6.7 million** on Sepolia. A too-low limit
   makes the transaction run out of gas and **fail, and the fee is lost**. Set the gas
   limit to **Custom: 10,000,000**. You do not pay for the limit, only for the gas
   actually used. (The maximum one transaction may use is about 16.7 million.)
5. **Contract:** choose `IntegrityRegistry`. **Deploy it FIRST.** Click **Deploy**.
6. MetaMask opens a confirmation. Read it before clicking:
   - network says **Sepolia**;
   - it says contract deployment;
   - the fee is a tiny amount of SepoliaETH (roughly 0.003 to 0.005 today).
   If MetaMask warns that the transaction is **expected to fail**, do not confirm: see
   Troubleshooting.
7. Click **Confirm** in MetaMask. Wait about 12 to 30 seconds. Remix's terminal shows a
   green tick, and the contract appears under **Deployed Contracts**.
8. Switch **Contract** to `MerkleRegistry` and deploy it the same way (about 0.002 to
   0.003 ETH).

**Predicted addresses.** Your wallet has sent no transactions yet, so the first
contract should land at:
- `IntegrityRegistry` at `0xF9885ec5865f1DeE480825eeB3a56F461D2439Ca`
- `MerkleRegistry` at `0xf69E23742D71E9d3dC67bb3fbc892f30080faE98`

An address comes from the sender and its transaction count, so this works only if
`IntegrityRegistry` is your wallet's very first transaction and `MerkleRegistry` its
second. If something else was sent first, the addresses differ. That is fine; it only
means the prediction no longer applies.

## 5. Try the contracts by hand

In **Deployed Contracts**, expand `IntegrityRegistry`. Orange buttons change the chain
(they cost gas and ask MetaMask to confirm). Blue buttons only read (free, instant).
Remix lets you type the arguments of a function into one box, separated by commas.

These values use the fixed teaching key from the project, so you get the same hashes.

**IntegrityRegistry**

| Step | Function (type) | Paste this | Expect |
|------|----------------|------------|--------|
| 1 | `anchorHash` (orange) | `"note",1,0x5c441319a657dd15db999f6f427ba1685edacceb6d13a2700b1baee881bef979` | confirm in MetaMask |
| 2 | `verify` (blue) | `"note",1,0x5c441319a657dd15db999f6f427ba1685edacceb6d13a2700b1baee881bef979` | `true` |
| 3 | `verify` | `"note",1,0xaced92d4f85fe7e1bd2f45da62070ebfd4d520f0a17459632c1cb40d3f090ab1` | `false` (this is the edited 10:30 note) |
| 4 | `getLatest` | `"note",1` | the hash above, version `1`, isDeleted `false` |
| 5 | `versionCount` | `"note",1` | `1` |
| 6 | `anchorHash` | `"note",1,0xaced92d4f85fe7e1bd2f45da62070ebfd4d520f0a17459632c1cb40d3f090ab1` | confirm (a second version) |
| 7 | `verify` | the 10:30 hash from step 6 | `true` |
| 8 | `verify` | the 10:00 hash from step 1 | `false` (old version no longer valid) |

The pair of hashes is the 10:00 and 10:30 appointment from the demo, so step 3 is the
tamper-detection idea you saw earlier, on a real public network.

**MerkleRegistry** (8 notes anchored with ONE transaction, then one note proven)

| Step | Function | Paste this | Expect |
|------|----------|------------|--------|
| 1 | `anchorRoot` (orange) | `0x6e6b910592b09acc015cd30c530114c722bcfe9295c87625a5866f53841c8dcc,8` | confirm |
| 2 | `batchCount` | (nothing) | `1` |
| 3 | `getBatch` | `0` | the root above, `8` |
| 4 | `verify` | `0,0xd328fed51b8b7b97429d8d9c263ce38cf422f57066aaf21ee36cacabec86f581,["0x42ece51efecad439f75d1947421898c86c75fc168aecdc73a07d8a8bbe6a6c1f","0xef89a000e84597086d3c1347e323601641d397d47a8b07c9cf0d9405667ea850","0xcf988f03bb2c62733d1fd79ba90d9db5076191fce2912107e3d7045fac766142"]` | `true` |
| 5 | `verify` | `0,0xa9dae51db6310da0247a74ec40ff0c60dd9a88efb1ebfa1afddbe3af2a0a9d8c,` then the same proof list as step 4 | `false` (note 3 was edited) |

Note the proof is only **3 hashes** for 8 notes.

If you ever want to regenerate these values, run
`.\python\.venv\Scripts\python.exe experiments\remix_inputs.py` from the project folder.

## 6. See it on the public block explorer

Open `https://sepolia.etherscan.io/address/<your contract address>`. You should see the
contract, the creation transaction from your wallet, and (after step 5) the
`anchorHash` transactions. Anyone in the world can look at this page, which is exactly
the point of a public network.

## 7. Connect it to our Python code

Our code finds a contract through a small file. A tool writes that file, but only after
checking the deployment really is ours. You need two things per contract, both public:
the **contract address** and the **transaction hash of its deployment** (copy it from
Remix's terminal, from MetaMask's Activity tab, or from Etherscan).

From the `python` folder:
```powershell
cd "C:\A Projects\Personal\BlockChainProj\python"
.\.venv\Scripts\python.exe register_deployment.py IntegrityRegistry 0xYOUR_ADDRESS 0xYOUR_TX_HASH --network sepolia
.\.venv\Scripts\python.exe register_deployment.py MerkleRegistry    0xYOUR_ADDRESS 0xYOUR_TX_HASH --network sepolia
.\.venv\Scripts\python.exe check_deployment.py --network sepolia
```
The first two print `Registered. Wrote ...`. The last should say **MATCHES our compiled
code** for both.

The tool refuses (and writes nothing) if any of these is wrong:
1. the node is not really Sepolia (chain id);
2. the code at that address is not exactly our compiled contract;
3. the transaction you gave did not create that address, or it failed;
4. the contract is owned by a different wallet than the key in `python/.env`.

Check 4 matters: only the owner can anchor hashes. Because you deployed from the same
wallet whose key is in `python/.env`, our Python code can write to these contracts.

---

## Troubleshooting

| Problem | Likely cause and fix |
|---------|----------------------|
| Remix does not show "Sepolia (11155111)" | MetaMask is on another network. Switch to Sepolia in MetaMask, then refresh Remix. **Never confirm a deployment on any other network.** |
| MetaMask says the transaction is **expected to fail** | Usually the gas limit is too low. Set Remix's gas limit to Custom 10,000,000 and try again. Do not confirm a doomed transaction. |
| Deployment shows as failed, "out of gas" | Same cause. The small fee is lost; fix the gas limit and redeploy. (This also changes the predicted addresses.) |
| MetaMask asks for a fee that looks large (more than 0.02 ETH) | Check the network is Sepolia and the gas limit is 10,000,000, not 100,000,000. Cancel and ask. |
| Compile error about `pragma` | Compiler version is not 0.8.24. Select it in the compiler tab. |
| `register_deployment` says "not our compiled ..." | Wrong address, wrong file, or different compiler settings. Re-check section 3 (paris, optimization OFF), recompile and redeploy, or ask for help. |
| `register_deployment` says the contract is "owned by" another account | You deployed from a different MetaMask account than the key in `.env`. Use the same account. |
| Transaction stays pending for minutes | Sepolia is busy. Wait. Do not resend repeatedly. |
| Remix cannot connect to MetaMask | Unlock MetaMask, refresh the page, click Deploy & run again. |

## Safety reminders

- Never type your Secret Recovery Phrase anywhere except into MetaMask when restoring.
- Never paste your private key into Remix, a website, or a chat.
- Remix and Etherscan never need your private key. Only MetaMask holds it.
- If any site asks you to "verify your wallet" with your phrase or key, close it.

## How this guide was checked

- All values in the tables are produced by `experiments/remix_inputs.py` and were
  replayed against the real contracts on a local node: every "Expect" held.
- The compile settings were verified by reproducing a Remix-style compile with the
  same compiler engine and comparing the code with our Hardhat build.
- The registration and check tools have automated tests, including a test for each
  of the four refusals above.
- Not verified here: the exact wording and layout of the current Remix and MetaMask
  screens, which change between versions. If a button is not where this guide says,
  tell me what you see and we will adjust.
