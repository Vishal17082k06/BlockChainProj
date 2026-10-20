# How to run the project

Written for Windows PowerShell (the default terminal in VS Code). Every command
below was tested on a fresh copy of the repository, starting from nothing.

Project folder used in the examples: `C:\A Projects\Personal\BlockChainProj`
(the path has spaces, so keep the quotes around it).

---

## 1. The big picture (read this once)

The project has three moving parts, and you need to see how they fit:

```
  Terminal A                         Terminal B
  ----------                         ----------
  The BLOCKCHAIN NODE                Everything else:
  (npx hardhat node)                 - deploy the contracts onto the node
  A fake blockchain running          - run tests
  on your laptop at                  - run the demos
  http://127.0.0.1:8545              The Python code talks to the node
  Leave this window open.            over that address.
```

- The **node** is the blockchain. It must be running for anything that talks to the
  chain. It keeps everything in memory: close it and every contract and every
  anchored hash is gone.
- A **contract** is a program living on the node. After you start a fresh node, you
  must **deploy** the contracts onto it again (one command each).
- The **tests and demos** are the programs that use the contracts.

Some things do NOT need the node, because Hardhat starts a private throwaway
blockchain just for them. The table in section 4 says which is which.

---

## 2. One-time setup (only on a new machine)

**On this machine, this is already done. Skip to section 3.** You can check:
`blockchain\node_modules`, `python\.venv` and `python\.env` all exist.

You need installed: Node.js, Python 3.10+, Git. (We used Node 22.17, Python 3.14.)

Open PowerShell and run these in order:

```powershell
# 1. JavaScript side: download the tools (about 1 minute)
cd "C:\A Projects\Personal\BlockChainProj\blockchain"
npm ci

# 2. Python side: make a private environment and install the libraries (about 2 minutes)
cd "C:\A Projects\Personal\BlockChainProj\python"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Create your secret key file (see the note below), without printing the key
.\.venv\Scripts\python.exe -c "import secrets, pathlib; pathlib.Path('.env').write_text('INTEGRITY_SECRET_KEY=' + secrets.token_hex(32) + chr(10))"
```

Notes:
- We call `.\.venv\Scripts\python.exe` directly instead of "activating" the
  environment. Activation scripts are sometimes blocked by PowerShell's security
  settings; calling the program directly always works.
- The `.env` file holds your secret key. It is ignored by git, so it never gets
  uploaded. **Do not open it on a screen share and do not paste it anywhere.** If
  you lose it, data hashed with it can never be re-verified. Back it up privately.
- Step 3 lets Python write the file itself. Writing it with PowerShell's `>`
  worked in our test too, but can add an invisible marker at the start of the file
  depending on the PowerShell version, so this way is safer.
- Tests do not need `.env` (they use their own fake key). The demos do.

---

## 3. The routine every time you work

### Terminal A: start the blockchain (leave it running)

```powershell
cd "C:\A Projects\Personal\BlockChainProj\blockchain"
npx hardhat node
```

You should see:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
Accounts
========
WARNING: These accounts, and their private keys, are publicly known.
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...
```
Those 20 accounts hold fake ETH and have publicly known keys. They are safe to use
here and must never be used on a real network. The window then just sits there.
That is correct. New lines appear whenever something uses the chain.

In VS Code: Terminal menu, New Terminal. Use the split button to open a second one.

### Terminal B: deploy the contracts onto that fresh node

```powershell
cd "C:\A Projects\Personal\BlockChainProj\blockchain"
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/deploy_merkle.js --network localhost
```

Expected:
```
IntegrityRegistry deployed to 0x5FbDB2315678afecb367f032d93F642f64180aa3
MerkleRegistry deployed to 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```
Those addresses are the same every time on a fresh node, because an address comes
from the deployer's account and its transaction count. Each command also writes a
`deployment.json` file that tells the Python code where the contract lives.

**You must repeat this deploy step every time you start a new node.**

---

## 4. What to run

| # | What | Needs the node? | Command (from the folder shown) | Expected result |
|---|------|-----------------|---------------------------------|-----------------|
| 1 | Smart contract tests | No | `blockchain`: `npx hardhat test` | `34 passing` |
| 2 | Python tests | **Yes** (and deploy) | `python`: `.\.venv\Scripts\python.exe -m pytest -q` | `67 passed` |
| 3 | Tamper-detection demo | **Yes** (and deploy) | `python`: `.\.venv\Scripts\python.exe demo.py` | 9 numbered steps, see below |
| 4 | Merkle batching demo | **Yes** (and deploy) | `python`: `.\.venv\Scripts\python.exe merkle_demo.py` | 5 steps, see below |
| 5 | Gas: two key designs | No | `blockchain`: `npx hardhat run scripts/measure_gas.js` | a table of gas numbers |
| 6 | Gas: Merkle vs single | No | `blockchain`: `npx hardhat run scripts/measure_merkle_gas.js` | two tables |
| 7 | Rebuild records from events | No | `blockchain`: `npx hardhat run scripts/demo_events.js` | JSON of 2 records |
| 8 | Hash experiment | No | repo root: `.\python\.venv\Scripts\python.exe experiments\hash_demo.py` | 3 parts |
| 9 | Toy blockchain | No | repo root: `.\python\.venv\Scripts\python.exe experiments\toy_chain.py` | 4 stages |
| 10 | Narrated tour of ONE note | **Yes** (and deploy) | repo root: `.\python\.venv\Scripts\python.exe experiments\life_of_a_note.py` | 8 stages, from database row to `TAMPERED` |
| 11 | Check a deployment is our code | **Yes** (and deploy) | `python`: `.\.venv\Scripts\python.exe check_deployment.py` (add `--network sepolia`) | `MATCHES our compiled code` |
| 12 | Register a hand-deployed contract | the network it is on | `python`: `.\.venv\Scripts\python.exe register_deployment.py <Contract> <address> <tx hash> --network sepolia` | `Registered. Wrote ...` (see `docs/remix-guide.md`) |
| 13 | Test values for Remix | No | repo root: `.\python\.venv\Scripts\python.exe experiments\remix_inputs.py` | hashes and a Merkle proof |

Each "cd" is `cd "C:\A Projects\Personal\BlockChainProj\<folder>"`.

### What the main demo prints (command 3)

```
1. Create three notes. Each is saved in the database and its hash anchored on-chain.
2. note 1, untouched                       -> VERIFIED
3. note 1 after silent edit                -> TAMPERED
4. refused: Update refused: record status is TAMPERED
5. note 2 after legitimate edit            -> VERIFIED
6. note 2 restored to its version-1 text   -> TAMPERED
7. note 3 after silent delete              -> MISSING_FROM_DB
8. summary: {'TAMPERED': 2, 'MISSING_FROM_DB': 1}
9. note 4 after authorised delete          -> DELETED_AUTHORIZED
```
Run it as many times as you like: at the end it rolls the chain back to where it
started. Add `--keep` to leave the anchors on the chain.

### What the Merkle demo prints (command 4)

```
batch 0, block 3, gas used 115809
note 3, untouched              python: VERIFIED  | contract: VERIFIED
note 3 after silent edit       python: TAMPERED  | contract: TAMPERED
```

---

## 5. Shutting down

In Terminal A press **Ctrl + C**. The node stops and the blockchain is erased. That
is normal. Next time: start a node (section 3A), then deploy (section 3B).

If you close the VS Code window without pressing Ctrl + C, the node may keep
running in the background and block port 8545 next time (see the table below).

---

## 6. When something goes wrong

These are the exact messages you will see, from tests we ran on purpose.

| What you see | What it means | Fix |
|--------------|---------------|-----|
| `Error: listen EADDRINUSE: address already in use 127.0.0.1:8545` when starting the node | A node is already running (maybe a forgotten one) | Find it: `Get-NetTCPConnection -LocalPort 8545 -State Listen` shows the process id. If it is your own old Hardhat node, stop it: `Stop-Process -Id <that id> -Force`. Then start again. |
| `Cannot run demo: Blockchain node not reachable at http://127.0.0.1:8545` | No node is running | Start Terminal A (section 3A) |
| `Cannot run demo: No contract at 0x5Fb... The local chain was probably restarted: redeploy.` | The node is running but it is a fresh one with nothing deployed | Run the two deploy commands (section 3B) |
| pytest shows many `skipped` with `Local chain not available` instead of `67 passed` | Same two causes as above, handled politely by the tests | Start the node, then deploy |
| `INTEGRITY_SECRET_KEY is not set (see python/.env.example)` | The `.env` file is missing | Redo step 3 of section 2 |
| `HH700: Artifact for contract ... not found` | Contract not compiled / wrong folder | Run commands from the `blockchain` folder; `npx hardhat compile` |
| `npx : File ... cannot be loaded` or scripts blocked | PowerShell security setting | Use `npx.cmd` instead of `npx`, or run in the VS Code terminal |
| Command not found for `python` | Python not on PATH | Reinstall Python and tick "Add to PATH" |

Red text that says `NativeCommandError` can appear in PowerShell next to a normal
error message. It is just PowerShell's wrapper around the message, not a second
problem.

---

## 7. Cheat sheet

```powershell
# Terminal A (leave open)
cd "C:\A Projects\Personal\BlockChainProj\blockchain"
npx hardhat node

# Terminal B
cd "C:\A Projects\Personal\BlockChainProj\blockchain"
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/deploy_merkle.js --network localhost
npx hardhat test

cd "C:\A Projects\Personal\BlockChainProj\python"
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe demo.py
.\.venv\Scripts\python.exe merkle_demo.py
```

---

## 8. The Witness console (web interface)

A browser console for the whole story: create notes, tamper with the database, watch the chain
catch it, with real transaction hashes and block numbers. Works on the local chain or Sepolia.

1. Have the local node running and the contracts deployed (section 3).
2. Start it (from the `python` folder):
   ```powershell
   .\.venv\Scripts\python.exe run_ui.py
   ```
3. Build the frontend once (and again after changing it), from the `frontend` folder:
   ```powershell
   npm install
   npm run build
   ```
4. Open **http://127.0.0.1:8000** in your browser. (`http://127.0.0.1:8000/api/docs` shows the raw API.)

To work on the interface itself, see `frontend/README.md`.

Notes:
- It listens on `127.0.0.1` only, so nothing outside your computer can reach the Attack lab.
- Local notes live in `python/data/local.db`, Sepolia notes in `python/data/sepolia.db`
  (git-ignored). Deleting a database is safe: new ids continue after the highest id the chain
  has seen.
- **Sepolia writes spend test ETH** (about 0.0005 per anchor at today's prices). The console
  refuses to start a write if the wallet holds less than 0.002 ETH.
- Only one write runs at a time per network; the interface greys out the buttons meanwhile.
