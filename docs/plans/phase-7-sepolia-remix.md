# Phase 7: Sepolia Testnet and Remix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **GATE** require the user's explicit go-ahead in chat immediately before they run. Steps marked **USER** are done by the user, not the agent.

**Goal:** Run the same contract and Python module on the public Sepolia test network, with transactions signed locally by a throwaway key, and repeat the deployment by hand in Remix with MetaMask.

**Architecture:** First, with no real network involved, add local signing to `chain.py` (using a publicly known Hardhat test key against the local node), a hard guardrail that refuses to sign on any network that is not an approved test network, and a deploy script that does a dry run before sending. Only after those are tested do we generate a throwaway wallet, fund it from a faucet, and deploy.

**Tech Stack:** Hardhat 2 (+ `dotenv`), web3.py 8 / eth-account (local signing), Sepolia (chain id 11155111), a public RPC endpoint, Etherscan (Sepolia), Remix, MetaMask.

**Spec:** PDF sections 3.7 (network types), 8.10 (signing note), 10 (local chain is a simulation), 11 (testnet). Master plan Phase 7.

## Blast radius (read before any GATE)

| Item | What it is | What it can do | What it cannot do |
|------|------------|----------------|-------------------|
| `SEPOLIA_PRIVATE_KEY` (in `python/.env`) | Key of a brand-new wallet created just for this project | Sign transactions from that one address on any network | Touch your real wallets or funds; it has never held real money |
| Sepolia test ETH | Free tokens with no monetary value | Pay gas on Sepolia | Be sold or moved to mainnet in any useful way |
| Public RPC URL | A free read/write gateway to Sepolia | Relay our signed transactions | Sign anything (it never sees the key) |
| Faucet | A website that sends test ETH to a public address | Needs ONLY the public address | Needs a seed phrase or private key: **a site that asks for either is a scam** |
| Etherscan (Sepolia) | A public block explorer | Show contract and transactions | Needs no login for viewing |

Guardrails built in this phase:
1. A fresh wallet with zero mainnet balance: even if the wrong network were somehow selected, nothing real could be spent.
2. `chain.py` refuses to sign unless the chain id is in an approved set (local 31337, Sepolia 11155111). Mainnet (1) is refused in code.
3. The deploy script refuses any network except Sepolia, prints the estimated cost, and only sends when `CONFIRM_DEPLOY=yes`.
4. `.env` is git-ignored and checked before and after every step; the key is never printed, logged, or pasted into chat. The agent never asks for a seed phrase or key.
5. The deployed address, ABI and deployment block are NOT secret; the Sepolia deployment files ARE committed so a reviewer can look the contract up on Etherscan.

## Global Constraints

- Existing suites keep passing: Hardhat 34, Python 67 (plus the new tests of this phase).
- Existing local behaviour is unchanged: with no private key, `Chain` still uses the dev node's unlocked account.
- Local deployment files stay `blockchain/deployment.json` and `blockchain/merkle_deployment.json` (git-ignored). Sepolia files are `blockchain/deployment.sepolia.json` and `blockchain/merkle_deployment.sepolia.json` (committed).
- The Hardhat in-process network (`--network hardhat`, the default) must never write a deployment file: its addresses exist only in a throwaway chain and would break the Python tests.
- Gas price and cost figures come only from measurements on Sepolia (balance before minus balance after), never assumed.
- Facts about faucets and RPC endpoints are "last reported" and must be re-checked on the day: pk910 (browser proof-of-work, no account), QuickNode (once per 12 hours); Alchemy and GetBlock want mainnet ETH and are avoided. Public RPC candidates: `https://ethereum-sepolia-rpc.publicnode.com`, `https://sepolia.drpc.org`.
- Public RPCs limit `eth_getLogs` ranges, so event queries must start at the deployment block and run in chunks.

## File structure

| File | Responsibility |
|------|----------------|
| `python/settings.py` | add `profile(name)` for `"local"` / `"sepolia"` |
| `python/chain.py` | signing path (`_send`), `WrongNetwork` guardrail, `for_network`, deployment-block and chunked log queries |
| `python/merkle_chain.py` | use `_send`, add `for_network` |
| `python/new_wallet.py` | create a throwaway wallet; writes the key to `.env`, prints only the address |
| `python/demo.py` | `--network sepolia` mode (unique ids, no rollback, balance before/after, Etherscan links) |
| `python/tests/test_signing.py`, `test_settings.py`, `test_new_wallet.py` | new tests |
| `blockchain/hardhat.config.js` | optional `sepolia` network from `.env` |
| `blockchain/scripts/lib/deploy_contract.js` | shared deploy logic with dry run and guardrails |
| `blockchain/scripts/deploy.js`, `deploy_merkle.js` | thin wrappers around it |
| `docs/journal/20-signing.md`, `21-sepolia-deploy.md`, `22-sepolia-demo.md`, `23-remix.md` | journal |

---

### Task 7.1: Local signing, guardrail and settings profile (TDD, no real network)

**Files:**
- Create: `python/tests/test_signing.py`, `python/tests/test_settings.py`
- Modify: `python/chain.py`, `python/merkle_chain.py`, `python/settings.py`, `python/conftest.py`

**Interfaces:**
- Produces:
  - `chain.ALLOWED_SIGNING_CHAIN_IDS: frozenset[int]` = `{31337, 11155111}`
  - `chain.WrongNetwork(Exception)`
  - `Chain(rpc_url=None, deployment_file=None, private_key=None)`; `Chain.for_network(name="local") -> Chain`; `Chain.LOG_CHUNK: int` (default 2000)
  - `Chain._send(w3, call) -> (tx_hash: HexBytes, receipt)` (private helper)
  - `MerkleChain(rpc_url=None, deployment_file=None, private_key=None)`; `MerkleChain.for_network(name="local")`
  - `settings.profile(name: str) -> dict` with keys `rpc_url`, `deployment_file`, `merkle_deployment_file`, `private_key` (None for local); raises `RuntimeError` if a Sepolia variable is missing, `ValueError` for an unknown name
- Public key used in tests: Hardhat account #0 `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (the contract owner on the local chain) and account #1 `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`. Both are printed by `npx hardhat node` and are publicly known and worthless.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_signing.py`:
```python
import json

import pytest
from web3.exceptions import ContractLogicError

import chain as chain_module
import settings
from chain import Chain, WrongNetwork
from merkle_chain import MerkleChain
from eth_utils import keccak

# Publicly known Hardhat test keys (printed by `npx hardhat node`). Worthless.
HARDHAT_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"   # owner
HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # not owner
H1 = bytes(range(32))
H2 = bytes(range(1, 33))


@pytest.fixture
def signing_chain(_live_chain):
    c = Chain(private_key=HARDHAT_KEY_0)
    snap = c.snapshot()
    yield c
    c.revert(snap)


def test_signed_anchor_and_delete_work(signing_chain):
    result = signing_chain.anchor("note", 1, H1)
    assert result["version"] == 1 and result["tx_hash"].startswith("0x")
    assert signing_chain.get_latest("note", 1)["hash"] == H1
    signing_chain.mark_deleted("note", 1)
    assert signing_chain.get_latest("note", 1)["is_deleted"] is True


def test_signed_transaction_from_a_non_owner_is_rejected(_live_chain):
    c = Chain(private_key=HARDHAT_KEY_1)
    snap = c.snapshot()
    try:
        with pytest.raises(ContractLogicError):
            c.anchor("note", 1, H1)
    finally:
        c.revert(snap)


def test_signing_is_refused_on_an_unapproved_network(_live_chain, monkeypatch):
    monkeypatch.setattr(chain_module, "ALLOWED_SIGNING_CHAIN_IDS", frozenset({1}))
    with pytest.raises(WrongNetwork):
        Chain(private_key=HARDHAT_KEY_0).connect()


def test_mainnet_is_never_in_the_approved_set():
    assert 1 not in chain_module.ALLOWED_SIGNING_CHAIN_IDS


def test_the_dev_node_path_still_works_without_a_key(chain):
    assert chain.anchor("note", 2, H1)["version"] == 1


def test_signed_merkle_root_works(_live_merkle_chain):
    c = MerkleChain(private_key=HARDHAT_KEY_0)
    snap = c.snapshot()
    try:
        assert c.anchor_root(keccak(b"root"), 3)["batch_id"] == 0
    finally:
        c.revert(snap)


def test_event_queries_work_in_small_chunks(chain, monkeypatch):
    chain.anchor("note", 1, H1)
    chain.anchor("note", 2, H1)
    chain.anchor("note", 3, H2)
    monkeypatch.setattr(chain, "LOG_CHUNK", 1)         # force several requests
    assert chain.anchored_records() == {("note", 1), ("note", 2), ("note", 3)}


def test_event_queries_start_at_the_deployment_block(chain, tmp_path):
    chain.anchor("note", 1, H1)
    dep = json.loads(settings.deployment_file().read_text())
    dep["deploymentBlock"] = chain.connect()[0].eth.block_number + 1   # after every anchor
    f = tmp_path / "dep.json"
    f.write_text(json.dumps(dep))
    later = Chain(deployment_file=f)
    assert later.anchored_records() == set()           # nothing at or after that block
```

`python/tests/test_settings.py`:
```python
import pytest

import settings


def test_local_profile_has_no_private_key():
    p = settings.profile("local")
    assert p["private_key"] is None
    assert p["deployment_file"].name == "deployment.json"
    assert p["merkle_deployment_file"].name == "merkle_deployment.json"


def test_sepolia_profile_needs_its_variables(monkeypatch):
    monkeypatch.delenv("SEPOLIA_RPC_URL", raising=False)
    monkeypatch.delenv("SEPOLIA_PRIVATE_KEY", raising=False)
    with pytest.raises(RuntimeError):
        settings.profile("sepolia")


def test_sepolia_profile_reads_its_variables(monkeypatch):
    monkeypatch.setenv("SEPOLIA_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("SEPOLIA_PRIVATE_KEY", "0x" + "11" * 32)
    p = settings.profile("sepolia")
    assert p["rpc_url"] == "https://rpc.example"
    assert p["private_key"] == "0x" + "11" * 32
    assert p["deployment_file"].name == "deployment.sepolia.json"
    assert p["merkle_deployment_file"].name == "merkle_deployment.sepolia.json"


def test_unknown_profile_is_rejected():
    with pytest.raises(ValueError):
        settings.profile("mainnet")
```

- [ ] **Step 2: Run and confirm failure**

Run (from `python/`, node and both contracts running): `.venv/Scripts/python.exe -m pytest tests/test_signing.py tests/test_settings.py -q`
Expected: failures/errors such as `ImportError: cannot import name 'WrongNetwork'` and `AttributeError: module 'settings' has no attribute 'profile'`.

- [ ] **Step 3: Add `profile` to `python/settings.py`**

Append:
```python
def profile(name: str = "local") -> dict:
    """Connection settings for a named network."""
    if name == "local":
        return {"rpc_url": rpc_url(), "deployment_file": deployment_file(),
                "merkle_deployment_file": merkle_deployment_file(), "private_key": None}
    if name == "sepolia":
        url = os.environ.get("SEPOLIA_RPC_URL")
        key = os.environ.get("SEPOLIA_PRIVATE_KEY")
        if not url or not key:
            raise RuntimeError("SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY must be set in python/.env")
        chain_dir = PROJECT_ROOT / "blockchain"
        return {"rpc_url": url,
                "deployment_file": chain_dir / "deployment.sepolia.json",
                "merkle_deployment_file": chain_dir / "merkle_deployment.sepolia.json",
                "private_key": key}
    raise ValueError(f"Unknown network profile: {name!r}")
```

- [ ] **Step 4: Update `python/chain.py`**

Replace the file with (changes: guardrail constant and exception, private key support, `_send`, `for_network`, deployment block, chunked logs):
```python
import json

from web3 import Web3

import settings

# Networks we are willing to SIGN transactions on: Hardhat local and Sepolia. Never mainnet.
ALLOWED_SIGNING_CHAIN_IDS = frozenset({31337, 11155111})


class ChainUnavailable(Exception):
    """The blockchain node cannot be reached, or the contract is not deployed."""


class WrongNetwork(Exception):
    """Refusing to sign transactions on a network that is not an approved test network."""


class Chain:
    """The only place that talks to the blockchain."""

    LOG_CHUNK = 2000        # blocks per event query (public RPCs limit the range)

    def __init__(self, rpc_url=None, deployment_file=None, private_key=None):
        self._rpc_url = rpc_url or settings.rpc_url()
        self._deployment_file = deployment_file or settings.deployment_file()
        self._private_key = private_key       # None = use the dev node's unlocked account
        self._deployment_block = 0
        self._w3 = None
        self._contract = None

    @classmethod
    def for_network(cls, name="local"):
        p = settings.profile(name)
        return cls(rpc_url=p["rpc_url"], deployment_file=p["deployment_file"],
                   private_key=p["private_key"])

    def connect(self):
        if self._contract is not None:
            return self._w3, self._contract
        w3 = Web3(Web3.HTTPProvider(self._rpc_url))
        if not w3.is_connected():
            raise ChainUnavailable(f"Blockchain node not reachable at {self._rpc_url}")
        if self._private_key is not None and w3.eth.chain_id not in ALLOWED_SIGNING_CHAIN_IDS:
            raise WrongNetwork(
                f"Refusing to sign on chain id {w3.eth.chain_id}: not an approved test network")
        with open(self._deployment_file) as f:
            deployment = json.load(f)
        address = Web3.to_checksum_address(deployment["address"])
        if not w3.eth.get_code(address):
            raise ChainUnavailable(
                f"No contract at {address}. The local chain was probably restarted: redeploy.")
        self._deployment_block = deployment.get("deploymentBlock", 0)
        self._w3 = w3
        self._contract = w3.eth.contract(address=address, abi=deployment["abi"])
        return self._w3, self._contract

    def _run(self, action):
        """Run action(w3, contract); turn connection problems into ChainUnavailable."""
        try:
            w3, contract = self.connect()
            return action(w3, contract)
        except ChainUnavailable:
            self._w3 = self._contract = None
            raise
        except OSError as exc:      # requests' connection errors derive from OSError
            self._w3 = self._contract = None
            raise ChainUnavailable(f"Blockchain node error: {exc}") from exc

    def _send(self, w3, call):
        """Send one contract call as a transaction. Returns (tx_hash, receipt)."""
        if self._private_key is None:
            # Dev node only: its first account is unlocked and is the contract owner.
            tx_hash = call.transact({"from": w3.eth.accounts[0]})
        else:
            account = w3.eth.account.from_key(self._private_key)
            tx = call.build_transaction({
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
            })
            signed = account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash, w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)

    def anchor(self, record_type, record_id, digest):
        def act(w3, contract):
            tx_hash, receipt = self._send(
                w3, contract.functions.anchorHash(record_type, record_id, digest))
            events = contract.events.HashAnchored().process_receipt(receipt)
            return {
                "tx_hash": w3.to_hex(tx_hash),
                "block_number": receipt["blockNumber"],
                "version": events[0]["args"]["version"],
            }
        return self._run(act)

    def mark_deleted(self, record_type, record_id):
        def act(w3, contract):
            self._send(w3, contract.functions.markDeleted(record_type, record_id))
        return self._run(act)

    def get_latest(self, record_type, record_id):
        def act(w3, contract):
            h, version, timestamp, is_deleted = contract.functions.getLatest(
                record_type, record_id).call()
            return {"hash": bytes(h), "version": version,
                    "timestamp": timestamp, "is_deleted": is_deleted}
        return self._run(act)

    def anchored_records(self):
        """Every (record_type, record_id) ever anchored, from event logs only."""
        def act(w3, contract):
            latest = w3.eth.block_number
            found = set()
            for low in range(self._deployment_block, latest + 1, self.LOG_CHUNK):
                high = min(low + self.LOG_CHUNK - 1, latest)
                logs = contract.events.HashAnchored().get_logs(from_block=low, to_block=high)
                found |= {(e["args"]["recordType"], e["args"]["recordId"]) for e in logs}
            return found
        return self._run(act)

    # Development-node helpers (used by tests to reset state between tests).
    def snapshot(self):
        return self._run(lambda w3, c: w3.provider.make_request("evm_snapshot", [])["result"])

    def revert(self, snapshot_id):
        self._run(lambda w3, c: w3.provider.make_request("evm_revert", [snapshot_id]))
```

Note: if `signed.raw_transaction` is not the attribute name in the installed eth-account, check `dir(signed)` and use the correct one; record the finding in the journal.

- [ ] **Step 5: Update `python/merkle_chain.py`**

```python
import settings
from chain import Chain


class MerkleChain(Chain):
    """Talks to the MerkleRegistry contract. Reuses Chain's connection handling."""

    def __init__(self, rpc_url=None, deployment_file=None, private_key=None):
        super().__init__(rpc_url=rpc_url,
                         deployment_file=deployment_file or settings.merkle_deployment_file(),
                         private_key=private_key)

    @classmethod
    def for_network(cls, name="local"):
        p = settings.profile(name)
        return cls(rpc_url=p["rpc_url"], deployment_file=p["merkle_deployment_file"],
                   private_key=p["private_key"])

    def anchor_root(self, root, count):
        def act(w3, contract):
            tx_hash, receipt = self._send(w3, contract.functions.anchorRoot(root, count))
            events = contract.events.RootAnchored().process_receipt(receipt)
            return {
                "batch_id": events[0]["args"]["batchId"],
                "tx_hash": w3.to_hex(tx_hash),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
            }
        return self._run(act)

    def get_batch(self, batch_id):
        def act(w3, contract):
            root, count, timestamp = contract.functions.getBatch(batch_id).call()
            return {"root": bytes(root), "count": count, "timestamp": timestamp}
        return self._run(act)

    def batch_count(self):
        return self._run(lambda w3, c: c.functions.batchCount().call())

    def verify_on_chain(self, batch_id, leaf, proof):
        return self._run(lambda w3, c: c.functions.verify(batch_id, leaf, list(proof)).call())
```

- [ ] **Step 6: Expose the live-chain fixtures to the new test file**

`test_signing.py` uses `_live_chain` and `_live_merkle_chain`, which already exist in `conftest.py` (session scope). No change needed unless pytest reports "fixture not found".

- [ ] **Step 7: Run the new tests, then the whole suite**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_signing.py tests/test_settings.py -v` then `.venv/Scripts/python.exe -m pytest -q`
Expected: 8 + 4 = 12 new tests pass; whole suite `79 passed` (67 + 12). If the signing test for a non-owner raises a different exception type than `ContractLogicError`, record the actual type in the journal and assert that one (never loosen it to bare `Exception`).

- [ ] **Step 8: Mutation checks (confirm each change applied with `diff` before trusting a result)**

1. In `connect`, remove the `WrongNetwork` check: expect `test_signing_is_refused_on_an_unapproved_network` to fail.
2. In `chain.py` add `1` to `ALLOWED_SIGNING_CHAIN_IDS`: expect `test_mainnet_is_never_in_the_approved_set` to fail.
3. In `_send`, send with `w3.eth.accounts[0]` even when a key is given (ignore the key): expect `test_signed_transaction_from_a_non_owner_is_rejected` to fail (the non-owner would succeed using the unlocked owner account).
4. In `anchored_records`, always start from block `0`: expect `test_event_queries_start_at_the_deployment_block` to fail.

- [ ] **Step 9: Journal `docs/journal/20-signing.md`, then commit**

Explain: what "signing locally" means (the key never leaves the machine; only the signed bytes go to the RPC), nonce, EIP-1559 fees as filled by `build_transaction`, why the guardrail exists and why it is checked at connect time, the log-range problem and chunking, and the web3/eth-account details found.

```bash
git add python/settings.py python/chain.py python/merkle_chain.py python/tests/test_signing.py python/tests/test_settings.py docs/journal/20-signing.md
git commit -m "feat: add local transaction signing, network guardrail and settings profiles"
```

---

### Task 7.2: Deploy script with dry run and guardrails; Hardhat Sepolia config

**Files:**
- Create: `blockchain/scripts/lib/deploy_contract.js`
- Modify: `blockchain/scripts/deploy.js`, `blockchain/scripts/deploy_merkle.js`, `blockchain/hardhat.config.js`, `.gitignore` (no change expected: Sepolia files are intentionally NOT ignored)
- Install: `dotenv` (dev dependency)

**Interfaces:**
- Produces: `deployContract(hre, contractName, filePrefix)`; deployment files now contain `{ address, deploymentBlock, abi }`. Local network writes `<prefix>.json`; `sepolia` writes `<prefix>.sepolia.json`; the in-process `hardhat` network writes nothing.

- [ ] **Step 1: Install dotenv**

Run (from `blockchain/`): `npm install --save-dev dotenv`
Expected: added 1 package; `package.json` and lock file updated. No network keys involved.

- [ ] **Step 2: Write `blockchain/scripts/lib/deploy_contract.js`**

```javascript
const fs = require("fs");
const path = require("path");

const SEPOLIA_CHAIN_ID = 11155111n;

// Deploys `contractName`, writes <filePrefix>[.network].json with address, deployment block and ABI.
// On a real network it is a DRY RUN unless CONFIRM_DEPLOY=yes, and it only ever targets Sepolia.
async function deployContract(hre, contractName, filePrefix) {
  const { ethers, network } = hre;
  const inProcess = network.name === "hardhat";
  const isLocal = inProcess || network.name === "localhost";
  const Factory = await ethers.getContractFactory(contractName);

  if (!isLocal) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error(`Refusing to deploy: chain id ${chainId} is not Sepolia (${SEPOLIA_CHAIN_ID}).`);
    }
    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);
    const deployTx = await Factory.getDeployTransaction();
    const gas = await ethers.provider.estimateGas({ ...deployTx, from: signer.address });
    const fee = await ethers.provider.getFeeData();
    const price = fee.maxFeePerGas ?? fee.gasPrice;
    console.log(`Contract:       ${contractName}`);
    console.log(`Network:        ${network.name} (chain id ${chainId})`);
    console.log(`Deployer:       ${signer.address}`);
    console.log(`Balance:        ${ethers.formatEther(balance)} ETH`);
    console.log(`Estimated gas:  ${gas}`);
    console.log(`Estimated cost: ${ethers.formatEther(gas * price)} ETH (at max fee ${ethers.formatUnits(price, "gwei")} gwei)`);
    if (process.env.CONFIRM_DEPLOY !== "yes") {
      console.log("Dry run only. Nothing was sent. Re-run with CONFIRM_DEPLOY=yes to deploy.");
      return;
    }
  }

  const contract = await Factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  console.log(`${contractName} deployed to ${address} (block ${receipt.blockNumber})`);

  if (inProcess) {
    console.log("In-process network: its addresses exist only for this run, so no file was written.");
    return;
  }
  const artifact = await hre.artifacts.readArtifact(contractName);
  const suffix = network.name === "localhost" ? "" : `.${network.name}`;
  const out = path.join(__dirname, "..", "..", `${filePrefix}${suffix}.json`);
  fs.writeFileSync(out, JSON.stringify(
    { address, deploymentBlock: receipt.blockNumber, abi: artifact.abi }, null, 2));
  console.log("Wrote", out);
}

module.exports = { deployContract };
```

`blockchain/scripts/deploy.js`:
```javascript
const hre = require("hardhat");
const { deployContract } = require("./lib/deploy_contract");

deployContract(hre, "IntegrityRegistry", "deployment").catch((e) => { console.error(e); process.exit(1); });
```

`blockchain/scripts/deploy_merkle.js`:
```javascript
const hre = require("hardhat");
const { deployContract } = require("./lib/deploy_contract");

deployContract(hre, "MerkleRegistry", "merkle_deployment").catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Update `blockchain/hardhat.config.js`**

```javascript
require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
// Same file the Python code reads. Only variables, no secrets in this file.
require("dotenv").config({ path: path.join(__dirname, "..", "python", ".env") });

const { SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY } = process.env;

const networks = {
  // `npx hardhat node` listens here; scripts use `--network localhost`.
  localhost: { url: "http://127.0.0.1:8545" },
};
// Only defined when both variables exist, so local work never needs them.
if (SEPOLIA_RPC_URL && SEPOLIA_PRIVATE_KEY) {
  networks.sepolia = { url: SEPOLIA_RPC_URL, accounts: [SEPOLIA_PRIVATE_KEY], chainId: 11155111 };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Compiler version. Must satisfy the contracts' `pragma solidity ^0.8.20;`.
  solidity: "0.8.24",
  networks,
};
```

- [ ] **Step 4: Verify locally (no real network)**

Run (from `blockchain/`, node running):
1. `npx hardhat test` expect `34 passing` (unchanged).
2. `npx hardhat run scripts/deploy.js` (in-process network). Expect the "In-process network ... no file was written" message and `git status` unchanged.
3. `npx hardhat run scripts/deploy.js --network localhost` and `npx hardhat run scripts/deploy_merkle.js --network localhost`. Expect both to print an address and block, and write `deployment.json` / `merkle_deployment.json` now containing `deploymentBlock`. (This redeploys both contracts on the local node, giving them new addresses; the Python tests read the new files.)
4. `npx hardhat run scripts/deploy.js --network sepolia` with no Sepolia variables set. Expect a clear Hardhat error that the network `sepolia` is not defined (proving nothing is attempted).
5. From `python/`: `.venv/Scripts/python.exe -m pytest -q` expect `79 passed`.

- [ ] **Step 5: Journal `docs/journal/21-sepolia-deploy.md` (first half: the guardrailed deploy script), then commit**

```bash
git add blockchain/scripts blockchain/hardhat.config.js blockchain/package.json blockchain/package-lock.json docs/journal/21-sepolia-deploy.md
git commit -m "feat: add guardrailed deploy script with dry run and Sepolia network config"
```

---

### Task 7.3: Throwaway wallet, RPC, faucet, dry run  (**GATE A**)

**Files:**
- Create: `python/new_wallet.py`, `python/tests/test_new_wallet.py`
- Modify: `python/.env.example`; the real `python/.env` (git-ignored) gains two variables

- [ ] **Step 1: Write the failing test**

`python/tests/test_new_wallet.py`:
```python
import pytest
from eth_account import Account

from new_wallet import create_wallet


def test_creates_a_key_in_the_env_file_and_returns_only_the_address(tmp_path):
    env = tmp_path / ".env"
    env.write_text("OTHER=1")
    address = create_wallet(env)
    lines = env.read_text().splitlines()
    key_line = next(l for l in lines if l.startswith("SEPOLIA_PRIVATE_KEY="))
    key = key_line.split("=", 1)[1]
    assert key.startswith("0x") and len(key) == 66
    assert Account.from_key(key).address == address
    assert "OTHER=1" in lines                          # existing content preserved


def test_refuses_to_overwrite_an_existing_key(tmp_path):
    env = tmp_path / ".env"
    env.write_text("SEPOLIA_PRIVATE_KEY=0x" + "22" * 32 + "\n")
    before = env.read_text()
    with pytest.raises(RuntimeError):
        create_wallet(env)
    assert env.read_text() == before


def test_two_wallets_are_different(tmp_path):
    a = create_wallet(tmp_path / "a.env")
    b = create_wallet(tmp_path / "b.env")
    assert a != b
```

- [ ] **Step 2: Run, confirm failure, implement**

Expected first: `ModuleNotFoundError: No module named 'new_wallet'`.

`python/new_wallet.py`:
```python
"""Create a brand-new THROWAWAY wallet for the Sepolia testnet.

Writes SEPOLIA_PRIVATE_KEY to python/.env and prints ONLY the public address.
Never use a wallet that has ever held real money for this project.
Run (from python/):  .venv/Scripts/python.exe new_wallet.py
"""
import sys
from pathlib import Path

from eth_account import Account

ENV_PATH = Path(__file__).resolve().parent / ".env"


def create_wallet(env_path: Path) -> str:
    text = env_path.read_text() if env_path.exists() else ""
    if "SEPOLIA_PRIVATE_KEY=" in text:
        raise RuntimeError("A SEPOLIA_PRIVATE_KEY already exists in .env; refusing to overwrite it.")
    account = Account.create()
    key = account.key.hex()
    if not key.startswith("0x"):
        key = "0x" + key
    with env_path.open("a") as f:
        if text and not text.endswith("\n"):
            f.write("\n")
        f.write(f"SEPOLIA_PRIVATE_KEY={key}\n")
    return account.address


if __name__ == "__main__":
    try:
        address = create_wallet(ENV_PATH)
    except RuntimeError as exc:
        sys.exit(str(exc))
    print("New throwaway wallet created. The private key was saved to python/.env (git-ignored).")
    print("Public address (safe to share, this is what a faucet needs):")
    print(address)
```
Expected: `3 passed`.

- [ ] **Step 3: Update `python/.env.example`**

Append:
```
# Sepolia testnet (Phase 7). Use a brand-new throwaway wallet, never a real one.
# SEPOLIA_PRIVATE_KEY is created by python/new_wallet.py. Do not paste it anywhere.
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# SEPOLIA_PRIVATE_KEY=0x...
```

- [ ] **Step 4: Commit the tested code (no wallet yet)**

```bash
git add python/new_wallet.py python/tests/test_new_wallet.py python/.env.example
git commit -m "feat: add throwaway wallet generator for the testnet"
```

- [ ] **Step 5: GATE A. Stop and tell the user exactly what will happen next, then wait for "go ahead".**

Say: "Next I will (1) run `new_wallet.py`, which creates a fresh random key and saves it into `python/.env` (git-ignored); the key will not be shown on screen, only the public address. (2) Add the public RPC URL to `.env`. Nothing touches the network and nothing costs anything. The key can only control a wallet that has never held real money. OK to proceed?"

- [ ] **Step 6: After approval, create the wallet and prepare `.env`**

Run (from `python/`): `.venv/Scripts/python.exe new_wallet.py` and note the printed address.
Append the (non-secret) RPC line: `echo SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com >> .env`
Verify safely: `git check-ignore -v .env` prints a rule; `git status --short` does not list `.env`. Do NOT `cat` or print `.env`.
Confirm the RPC works without any key: from `python/`, a one-line check that `Web3(Web3.HTTPProvider(url)).eth.chain_id == 11155111` (if that endpoint is down, try another listed in Global Constraints and update `.env`).

- [ ] **Step 7: USER: fund the wallet from a faucet**

Give the user these instructions (re-check the faucet pages that day; this list was last reported):
1. Open the faucet in a normal browser tab. Options reported to need no mainnet balance: pk910 proof-of-work faucet (mines in the browser for roughly 20 minutes, no account) or QuickNode's Sepolia faucet (once per 12 hours). Skip faucets that require real ETH on mainnet.
2. Paste ONLY the public address printed in Step 6.
3. Never enter a seed phrase or private key on any site. A faucet that asks for one is a scam.
4. Wait for the test ETH, then check the balance on `https://sepolia.etherscan.io/address/<the address>`.
Aim for at least 0.05 SepoliaETH; the dry run in Step 8 shows what a deployment actually needs.

- [ ] **Step 8: Dry run of the deployment (sends nothing)**

Run (from `blockchain/`): `npx hardhat run scripts/deploy.js --network sepolia`
Expected: prints contract, network `sepolia (chain id 11155111)`, deployer address (must equal the wallet address), balance, estimated gas, estimated cost, then `Dry run only. Nothing was sent.` If the balance is below the estimate, ask the user to fund more. If the deployer address does not match, stop and investigate.

- [ ] **Step 9: Journal `docs/journal/21-sepolia-deploy.md` (second half: wallet, faucet, dry run output), commit**

```bash
git add docs/journal/21-sepolia-deploy.md
git commit -m "docs: record wallet setup and deployment dry run"
```

---

### Task 7.4: Deploy to Sepolia and inspect it  (**GATE B**)

- [ ] **Step 1: GATE B. Show the dry-run numbers and ask for approval.**

Say: "The dry run says the deployment costs about X test ETH. This sends one real transaction on the public Sepolia network from the throwaway wallet. It is permanent and publicly visible, and costs only worthless test ETH. Proceed?"

- [ ] **Step 2: After approval, deploy both contracts**

Run (from `blockchain/`):
`CONFIRM_DEPLOY=yes npx hardhat run scripts/deploy.js --network sepolia`
`CONFIRM_DEPLOY=yes npx hardhat run scripts/deploy_merkle.js --network sepolia`
Expected: each prints `... deployed to 0x... (block N)` and writes `deployment.sepolia.json` / `merkle_deployment.sepolia.json` (these are NOT git-ignored; `git status` shows them as new files). Confirm `.env` is still not listed.

- [ ] **Step 3: Inspect on the block explorer (USER or agent with the user)**

Open `https://sepolia.etherscan.io/address/<contract address>`. Check: the contract creation transaction, the deployer address equals the wallet, the block number matches the file. Note how long the deployment took (block time).

- [ ] **Step 4: Prove Python can read the Sepolia contract with no signing**

Run (from `python/`): a short script using `Chain.for_network("sepolia")` calling `get_latest("note", 1)` (expect version 0) and `Chain.for_network("sepolia").connect()` (expect no `WrongNetwork`).

- [ ] **Step 5: Journal, commit the Sepolia deployment files**

```bash
git add blockchain/deployment.sepolia.json blockchain/merkle_deployment.sepolia.json docs/journal/21-sepolia-deploy.md
git commit -m "feat: deploy IntegrityRegistry and MerkleRegistry to Sepolia"
```

---

### Task 7.5: Run the demo on Sepolia and measure the real cost

**Files:**
- Modify: `python/demo.py`

**Changes to `demo.py`:**
1. `main(network="local", keep=False)`; parse `--network sepolia` and `--keep` from `sys.argv`.
2. Build the chain with `Chain.for_network(network)`.
3. `network == "local"`: exactly today's behaviour (snapshot first, revert at the end unless `--keep`).
4. `network == "sepolia"`: no snapshot or revert (a public network cannot be rolled back). Before creating notes, set `INSERT INTO sqlite_sequence (name, seq) VALUES ('note', <int(time.time())>)` so every run uses fresh record ids (otherwise ids from an earlier run, including ones marked deleted, would collide). Print the wallet address and balance at the start and end; print `balance before - balance after` as the real cost in SepoliaETH; after each transaction-producing step print `https://sepolia.etherscan.io/tx/<tx_hash>` for the first proof.
5. Print which network and chain id is in use at the very start.

- [ ] **Step 1: Make the change and re-verify the local demo**

Run: `.venv/Scripts/python.exe demo.py` expect the same output as Step 15 (identical statuses), and `.venv/Scripts/python.exe -m pytest -q` expect `82 passed`.

- [ ] **Step 2: Run on Sepolia**

Run (from `python/`): `.venv/Scripts/python.exe demo.py --network sepolia`
Expected: the same sequence of statuses as locally (`VERIFIED`, `TAMPERED`, refused update, version 2, `TAMPERED` after rollback, `MISSING_FROM_DB`, summary, `DELETED_AUTHORIZED`). It takes minutes, because each transaction waits for a block (about 12 seconds on Sepolia). Record: total time, total cost in SepoliaETH, number of transactions, and the effective gas price (cost divided by gas used).
If `verify_all` fails with a log-range error from the public RPC, lower `Chain.LOG_CHUNK` (try 1000, then 500) and record the working value.

- [ ] **Step 3: Cross-check on Etherscan**

Open two of the printed transaction links. Confirm: `From` is the wallet, `To` is the contract, status success, and the "Input Data" is the anchorHash call. Open the contract's Events/Logs tab and find the `HashAnchored` events.

- [ ] **Step 4: Optional: anchor one Merkle batch on Sepolia**

Run a 3-line script using `MerkleChain.for_network("sepolia")`: anchor a root over 8 notes (as in `merkle_demo.py`), verify one proof on-chain. Record the gas used (expect the same 115,809-ish as the local run) and the real cost in ETH, then state the per-record cost of single anchoring versus batching in SepoliaETH using the measured gas price.

- [ ] **Step 5: Journal `docs/journal/22-sepolia-demo.md`, tick tasks in the master plan, commit**

Include: the real output, the measured gas price and cost, how long it took versus the local chain (instant), and what the Sepolia run adds over the local one (independent nodes keep copies, public timestamps, anyone can check). State honestly what it still does not prove: the owner is still one key, and a testnet is not mainnet security.

```bash
git add python/demo.py docs/journal/22-sepolia-demo.md docs/00-master-plan.md
git commit -m "feat: run the demo on Sepolia and record real costs"
```

---

### Task 7.6: Remix with MetaMask  (USER-driven walkthrough)

The agent cannot drive the browser; it writes the walkthrough and the user performs it, then reports back what they saw.

- [ ] **Step 1: Dry run in Remix with no wallet (zero risk)**

1. Open `https://remix.ethereum.org`.
2. Create `IntegrityRegistry.sol` in the file explorer; paste the contents of `blockchain/contracts/IntegrityRegistry.sol`.
3. Solidity compiler tab: choose compiler `0.8.24`, compile. Expect a green tick.
4. "Deploy & run" tab: Environment = `Remix VM`. Click Deploy.
5. Call `anchorHash` with `"note"`, `1`, and any 32-byte hex such as `0x` followed by 64 `a` characters. Then call `verify` with the same arguments (expect `true`) and with a different hash (expect `false`). Call `getLatest`.
Learning: the same contract and the same ABI, now driven by buttons instead of Python.

- [ ] **Step 2: MetaMask on Sepolia (small, real-network step)**

**GATE C:** confirm with the user that they are about to connect a wallet to Remix and send one transaction on Sepolia.
1. Install MetaMask from `https://metamask.io` (check the URL; only the official extension). Either use the throwaway wallet: MetaMask > "Import account" > paste the private key from `python/.env` (open the file yourself, never paste it in chat or here) or create a second throwaway wallet and fund it from a faucet. Use a wallet with NO mainnet balance.
2. In MetaMask enable test networks and select **Sepolia**. Confirm the account holds SepoliaETH.
3. In Remix, Environment = `Injected Provider - MetaMask`. Check that Remix shows `Sepolia (11155111)`. If it shows anything else, STOP.
4. Deploy; MetaMask asks to confirm. Read the network name and fee in the popup, then confirm.
5. Call `anchorHash` (a transaction, needs a MetaMask confirmation) and `verify` (a call, no confirmation).
6. Open the new contract on `https://sepolia.etherscan.io` and compare it with the Hardhat-deployed one.

- [ ] **Step 3: Journal `docs/journal/23-remix.md`**

What the user saw at each step (with the user's own words about what surprised them), what is identical between Hardhat and Remix deployments (bytecode and ABI) and what differs (manual, no tests, no scripting, the wallet confirmation step). Tick Phase 7 in the master plan, commit.

```bash
git add docs/journal/23-remix.md docs/00-master-plan.md
git commit -m "docs: record Remix and MetaMask walkthrough"
```

---

### Task 7.7 (optional): Verify the source code on Etherscan

Needs a free Etherscan account and API key, another credential, kept in `.env` as `ETHERSCAN_API_KEY`. Adds a green "Contract Source Code Verified" tab and a Read/Write UI. Offer it to the user at the end of 7.4; do not do it without their go-ahead and decision.

---

## Self-review

- **Spec coverage:** PDF 3.7 (testnet), 8.10 (signing instead of unlocked accounts), 10 (local-chain limitation, now answered), 11 (testnet) are covered by Tasks 7.1-7.6. The Remix step comes from the user's friend's suggestion, discussed earlier.
- **Safety:** the key is created by a script into a git-ignored file, never displayed; two explicit gates before the first real-network actions; chain-id guardrails in both Python and the deploy script; dry run before any send.
- **Placeholders:** none in code steps. Steps that depend on third-party sites (faucets, MetaMask UI) are written as instructions with "re-check on the day" notes, since those cannot be verified in advance.
- **Type consistency:** `Chain._send` returns `(tx_hash, receipt)` and is used identically in `anchor`, `mark_deleted` and `MerkleChain.anchor_root`; `settings.profile` keys match their use in both `for_network` methods; deployment file names match between `settings.py`, `deploy_contract.js` and the plan.
- **Tests added:** 8 signing + 4 settings + 3 wallet = 15, so Python goes 67 to 82. (Task 7.1 alone reaches 79; Task 7.3 adds 3 more.)
- **Known risk:** the exact attribute name `signed.raw_transaction` and the exception type for a non-owner signed transaction are the two web3/eth-account details to confirm when running Task 7.1, and the plan says to record what is actually found.
