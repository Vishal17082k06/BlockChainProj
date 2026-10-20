# Phase 5: Python Integrity Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Python module that hashes a database record, anchors the hash on the blockchain, and later verifies the record against the chain, demonstrated by a command-line script.

**Architecture:** Five small files with one job each. `hashing.py` turns a row into canonical JSON and an HMAC. `chain.py` is the only file that talks to the blockchain. `integrity.py` is the module itself (anchor, verify, verify-all). `notes.py` is a stand-in "application" that creates, updates and deletes notes and calls the module at the right moments. `db.py` sets up SQLite. The chain object is passed into functions (not imported globally) so tests can swap in an unreachable chain.

**Tech Stack:** Python 3.14, web3 8.0.0, SQLite (built in), python-dotenv, pytest 9.

**Spec:** PDF sections 7.2-7.7 (design), 8.7-8.12 (code), 9.2 (tests T1-T13). Master plan Phase 5.

## Facts verified against web3 8.0.0 and our running node (before writing this plan)

- `contract.events.HashAnchored().process_receipt(receipt)` works and returns a **tuple**; `events[0]["args"]["version"]` is an int.
- `get_logs(from_block=0)` is the correct keyword (snake_case).
- `bytes32` values come back as Python `bytes`; `getLatest(...).call()` returns a list `[hash_bytes, version, timestamp, is_deleted]`.
- `w3.provider.make_request("evm_snapshot", [])` and `("evm_revert", [snapshot_id])` work: sending a transaction then reverting restored `versionCount` to 0.
- `transact({"from": w3.eth.accounts[0]})` works on the Hardhat dev node; the transaction hash is `HexBytes`, so use `w3.to_hex(tx)`.

## Global Constraints

- Hash = HMAC-SHA256 over canonical JSON `{"type", "v", "data"}`; keys sorted, separators `(",", ":")`, `ensure_ascii=False`, UTF-8, Unicode NFC, UTC timestamps `%Y-%m-%dT%H:%M:%S.%fZ`, `None` stays JSON `null` (never `""`), schema version `SCHEMA_VERSION = 1`.
- The secret key comes only from the `INTEGRITY_SECRET_KEY` environment variable (loaded from `python/.env`). It is never printed, logged, committed or stored in the database. Never `cat` or print `.env`.
- SQL table and column names come only from the `RECORD_SPECS` whitelist; values always go through `?` placeholders.
- When the chain is unreachable, verification returns `UNAVAILABLE`, never `VERIFIED`.
- The chain is the authority. `integrity_log` is a local convenience copy and is never consulted to decide a verification result.
- Creating a note must succeed even if the chain is down (anchor later). Updating and deleting are **fail-closed**: refused if the chain cannot confirm the record's state (see Task 5.3 design note).
- Run all Python commands from `python/` using `.venv/Scripts/python.exe`.
- Tests that need the chain require `npx hardhat node` running with the contract deployed (`blockchain/deployment.json`). They skip with a clear message otherwise.

## File structure

| File | Responsibility |
|------|----------------|
| `python/pytest.ini` | Test config (`pythonpath = .`) |
| `python/.env.example` | Template of settings (committed). Real `python/.env` is gitignored |
| `python/settings.py` | Load `.env`; secret key, RPC URL, deployment file path |
| `python/hashing.py` | `canonical_bytes`, `keyed_hash` |
| `python/chain.py` | `Chain` class, `ChainUnavailable` |
| `python/db.py` | SQLite connection and tables (`note`, `integrity_log`) |
| `python/integrity.py` | `RECORD_SPECS`, `anchor_record`, `verify_record`, `verify_all` |
| `python/notes.py` | Stand-in app: `create_note`, `update_note`, `delete_note` |
| `python/demo.py` | Command-line demo of the whole story |
| `python/conftest.py` | Shared test fixtures |
| `python/tests/test_hashing.py`, `test_chain.py`, `test_integrity.py` | Tests |
| `docs/journal/12-hashing.md`, `13-chain.md`, `14-integrity.md`, `15-demo.md` | Journal |

---

### Task 5.1: Settings and hashing (TDD)

**Files:**
- Create: `python/pytest.ini`, `python/.env.example`, `python/conftest.py`, `python/settings.py`, `python/tests/test_hashing.py`, `python/hashing.py`
- Modify: `python/requirements.txt`
- Generated, not committed: `python/.env`

**Interfaces:**
- Produces:
  - `settings.secret_key() -> bytes` (raises `RuntimeError` if unset), `settings.rpc_url() -> str`, `settings.deployment_file() -> pathlib.Path`
  - `hashing.SCHEMA_VERSION: int`
  - `hashing.canonical_bytes(record_type: str, record: dict, fields: list) -> bytes`
  - `hashing.keyed_hash(payload: bytes) -> bytes` (32 bytes)

- [ ] **Step 1: Install python-dotenv and pin it**

Run (from `python/`): `.venv/Scripts/python.exe -m pip install python-dotenv`
Then: `.venv/Scripts/python.exe -m pip show python-dotenv` and add the exact line `python-dotenv==<version shown>` to `python/requirements.txt`.
Expected: install succeeds; `requirements.txt` now lists web3, pytest and python-dotenv, all with `==`.

- [ ] **Step 2: Create config files**

`python/pytest.ini`:
```ini
[pytest]
pythonpath = .
testpaths = tests
```

`python/.env.example`:
```
# Copy to .env and fill in. Never commit .env.
INTEGRITY_SECRET_KEY=replace-with-a-long-random-string
CHAIN_RPC_URL=http://127.0.0.1:8545
# DEPLOYMENT_FILE defaults to blockchain/deployment.json in this repository
```

Generate the real `.env` WITHOUT displaying the key (run from `python/`):
`.venv/Scripts/python.exe -c "import secrets; print('INTEGRITY_SECRET_KEY=' + secrets.token_hex(32)); print('CHAIN_RPC_URL=http://127.0.0.1:8545')" > .env`
Verify safely: `git check-ignore -v .env` must print a `.gitignore` rule, and `git status --short` must not list `.env`.

`python/conftest.py`:
```python
import os

# Tests use their own fixed key, set before anything imports settings, so results
# never depend on (or leak) the real key in .env.
os.environ["INTEGRITY_SECRET_KEY"] = "test-secret-key-not-for-production"

import pytest

from chain import Chain, ChainUnavailable
import db


@pytest.fixture(scope="session")
def _live_chain():
    c = Chain()
    try:
        c.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        pytest.skip(f"Local chain not available ({exc}). "
                    "Start 'npx hardhat node' and deploy the contract.")
    return c


@pytest.fixture
def chain(_live_chain):
    """The real local chain, rolled back to a clean state after every test."""
    snapshot = _live_chain.snapshot()
    yield _live_chain
    _live_chain.revert(snapshot)


@pytest.fixture
def dead_chain():
    """A chain object pointing at a port where nothing is listening."""
    return Chain(rpc_url="http://127.0.0.1:9")


@pytest.fixture
def conn():
    connection = db.connect(":memory:")
    yield connection
    connection.close()
```

`python/settings.py`:
```python
import os
from pathlib import Path

from dotenv import load_dotenv

PYTHON_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PYTHON_DIR.parent

# Real environment variables win over .env (override=False is the default).
load_dotenv(PYTHON_DIR / ".env")


def secret_key() -> bytes:
    key = os.environ.get("INTEGRITY_SECRET_KEY")
    if not key:
        raise RuntimeError("INTEGRITY_SECRET_KEY is not set (see python/.env.example)")
    return key.encode("utf-8")


def rpc_url() -> str:
    return os.environ.get("CHAIN_RPC_URL", "http://127.0.0.1:8545")


def deployment_file() -> Path:
    override = os.environ.get("DEPLOYMENT_FILE")
    return Path(override) if override else PROJECT_ROOT / "blockchain" / "deployment.json"
```

- [ ] **Step 3: Write the failing hashing tests**

`python/tests/test_hashing.py`:
```python
from datetime import datetime, timezone, timedelta

import pytest

import hashing
from hashing import canonical_bytes, keyed_hash

FIELDS = ["noteid", "interactionid", "content"]


def rec(**overrides):
    base = {"noteid": 7, "interactionid": 1, "content": "hello"}
    base.update(overrides)
    return base


def test_golden_format_is_frozen():
    # If this fails, the canonical format changed and every existing hash is invalid.
    assert canonical_bytes("note", rec(), FIELDS) == \
        b'{"data":{"content":"hello","interactionid":1,"noteid":7},"type":"note","v":1}'


def test_same_input_same_bytes_and_hash():
    a = canonical_bytes("note", rec(), FIELDS)
    b = canonical_bytes("note", rec(), FIELDS)
    assert a == b
    assert keyed_hash(a) == keyed_hash(b)


def test_one_character_change_changes_hash():
    a = keyed_hash(canonical_bytes("note", rec(content="10:00 AM"), FIELDS))
    b = keyed_hash(canonical_bytes("note", rec(content="10:30 AM"), FIELDS))
    assert a != b


def test_dict_order_and_field_list_order_do_not_matter():
    shuffled = {"content": "hello", "noteid": 7, "interactionid": 1}
    assert canonical_bytes("note", shuffled, FIELDS) == canonical_bytes("note", rec(), FIELDS)
    assert canonical_bytes("note", rec(), list(reversed(FIELDS))) == canonical_bytes("note", rec(), FIELDS)


def test_unicode_normalisation_composed_vs_decomposed():
    composed = "café"          # e-acute as one character
    decomposed = "café"       # e followed by a combining accent
    assert canonical_bytes("note", rec(content=composed), FIELDS) == \
        canonical_bytes("note", rec(content=decomposed), FIELDS)


def test_non_latin_text_is_kept_not_escaped():
    out = canonical_bytes("note", rec(content="日本語"), FIELDS)
    assert "日本語".encode("utf-8") in out


def test_naive_datetime_is_treated_as_utc():
    naive = datetime(2026, 4, 20, 10, 0, 0)
    aware = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
    f = ["noteid", "when"]
    assert canonical_bytes("note", {"noteid": 1, "when": naive}, f) == \
        canonical_bytes("note", {"noteid": 1, "when": aware}, f)


def test_aware_datetime_in_other_zone_is_converted_to_utc():
    ist = timezone(timedelta(hours=5, minutes=30))
    local = datetime(2026, 4, 20, 15, 30, 0, tzinfo=ist)
    utc = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
    f = ["noteid", "when"]
    assert canonical_bytes("note", {"noteid": 1, "when": local}, f) == \
        canonical_bytes("note", {"noteid": 1, "when": utc}, f)


def test_none_and_empty_string_differ():
    assert canonical_bytes("note", rec(content=None), FIELDS) != \
        canonical_bytes("note", rec(content=""), FIELDS)


def test_field_boundaries_cannot_be_confused():
    # The naive join "1"+"23" == "12"+"3" collision from experiments/hash_demo.py.
    a = canonical_bytes("note", rec(interactionid=1, content="23"), FIELDS)
    b = canonical_bytes("note", rec(interactionid=12, content="3"), FIELDS)
    assert a != b


def test_record_type_is_part_of_the_hash():
    assert canonical_bytes("note", rec(), FIELDS) != canonical_bytes("conversation", rec(), FIELDS)


def test_unlisted_columns_are_ignored():
    extra = rec(created_at="2026-01-01")
    assert canonical_bytes("note", extra, FIELDS) == canonical_bytes("note", rec(), FIELDS)


def test_missing_listed_field_raises():
    with pytest.raises(KeyError):
        canonical_bytes("note", {"noteid": 1, "interactionid": 1}, FIELDS)


def test_keyed_hash_is_32_bytes_and_depends_on_key(monkeypatch):
    payload = canonical_bytes("note", rec(), FIELDS)
    h1 = keyed_hash(payload)
    assert isinstance(h1, bytes) and len(h1) == 32
    monkeypatch.setenv("INTEGRITY_SECRET_KEY", "a-different-key")
    assert keyed_hash(payload) != h1


def test_missing_key_raises(monkeypatch):
    monkeypatch.delenv("INTEGRITY_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        keyed_hash(b"anything")
```

- [ ] **Step 4: Run and confirm failure**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_hashing.py -v`
Expected: error `ModuleNotFoundError: No module named 'chain'` (conftest imports it) or `'hashing'`. For this step only, temporarily satisfy conftest by creating an empty-but-importable stub is NOT allowed; instead run with `-p no:cacheprovider --noconftest`: `.venv/Scripts/python.exe -m pytest tests/test_hashing.py -v --noconftest` and expect `ModuleNotFoundError: No module named 'hashing'`. (With `--noconftest` the key is not set by conftest, so also `export INTEGRITY_SECRET_KEY=x` is unnecessary yet; the import fails first.)

- [ ] **Step 5: Implement `python/hashing.py`**

```python
import hashlib
import hmac
import json
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal

import settings

SCHEMA_VERSION = 1   # bump if the canonical format or field lists ever change


def _normalise(value):
    if value is None:
        return None
    if isinstance(value, datetime):               # check before date: datetime is a date
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)   # treat naive timestamps as UTC
        return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    return value


def canonical_bytes(record_type: str, record: dict, fields: list) -> bytes:
    """One exact, unambiguous byte string for a record (PDF 7.2)."""
    data = {f: _normalise(record[f]) for f in sorted(fields)}
    payload = {"type": record_type, "v": SCHEMA_VERSION, "data": data}
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")


def keyed_hash(payload: bytes) -> bytes:
    """HMAC-SHA256 with the secret key. 32 bytes, exactly a Solidity bytes32."""
    return hmac.new(settings.secret_key(), payload, hashlib.sha256).digest()
```

- [ ] **Step 6: Make conftest importable, then run the hashing tests**

`conftest.py` imports `chain` and `db`, which do not exist yet. To keep this task self-contained, create these two minimal files now and replace them in Tasks 5.2 and 5.3 (their real content is in those tasks):

`python/chain.py` (temporary):
```python
class ChainUnavailable(Exception):
    pass


class Chain:
    pass
```
`python/db.py` (temporary):
```python
def connect(path=":memory:"):
    raise NotImplementedError
```

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_hashing.py -v`
Expected: 15 passed.

- [ ] **Step 7: Journal `docs/journal/12-hashing.md`, then commit**

Explain canonical form rule by rule, what the golden test protects, why the key lives in `.env`, and the NFC and timezone cases.

```bash
git add python/pytest.ini python/.env.example python/conftest.py python/settings.py python/hashing.py python/chain.py python/db.py python/tests python/requirements.txt docs/journal/12-hashing.md
git commit -m "feat: add settings and hashing module with tests"
```
(`python/.env` must not appear in `git status`.)

---

### Task 5.2: Chain access (TDD, first real test of web3 v8)

**Files:**
- Create: `python/tests/test_chain.py`
- Replace: `python/chain.py`

**Interfaces:**
- Consumes: `settings.rpc_url()`, `settings.deployment_file()`.
- Produces: `chain.ChainUnavailable(Exception)` and class `chain.Chain(rpc_url=None, deployment_file=None)` with
  - `connect() -> None` (raises `ChainUnavailable` if node unreachable or no contract at the address)
  - `anchor(record_type: str, record_id: int, digest: bytes) -> dict` with keys `tx_hash: str`, `block_number: int`, `version: int`
  - `mark_deleted(record_type: str, record_id: int) -> None`
  - `get_latest(record_type: str, record_id: int) -> dict` with keys `hash: bytes`, `version: int`, `timestamp: int`, `is_deleted: bool`
  - `anchored_records() -> set[tuple[str, int]]` built from `HashAnchored` event logs only
  - `snapshot() -> str` and `revert(snapshot_id: str) -> None` (development node only, used by tests)
- All methods raise `ChainUnavailable` when the node cannot be reached.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_chain.py`:
```python
import pytest
from web3.exceptions import ContractLogicError

from chain import Chain, ChainUnavailable

H1 = bytes(range(32))
H2 = bytes(range(1, 33))


def test_anchor_then_get_latest(chain):
    result = chain.anchor("note", 1, H1)
    assert result["version"] == 1
    assert result["tx_hash"].startswith("0x")
    assert isinstance(result["block_number"], int)

    latest = chain.get_latest("note", 1)
    assert latest["hash"] == H1
    assert latest["version"] == 1
    assert latest["timestamp"] > 0
    assert latest["is_deleted"] is False


def test_reanchor_creates_version_two(chain):
    chain.anchor("note", 1, H1)
    assert chain.anchor("note", 1, H2)["version"] == 2
    assert chain.get_latest("note", 1)["hash"] == H2


def test_unknown_record_has_version_zero(chain):
    assert chain.get_latest("note", 999)["version"] == 0


def test_mark_deleted_sets_flag_and_blocks_anchoring(chain):
    chain.anchor("note", 1, H1)
    chain.mark_deleted("note", 1)
    assert chain.get_latest("note", 1)["is_deleted"] is True
    with pytest.raises(ContractLogicError):
        chain.anchor("note", 1, H2)


def test_anchored_records_comes_from_event_logs(chain):
    chain.anchor("note", 1, H1)
    chain.anchor("note", 2, H1)
    chain.anchor("note", 1, H2)
    assert chain.anchored_records() == {("note", 1), ("note", 2)}


def test_snapshot_revert_restores_state(chain):
    snap = chain.snapshot()
    chain.anchor("note", 5, H1)
    chain.revert(snap)
    assert chain.get_latest("note", 5)["version"] == 0


def test_unreachable_node_raises_chain_unavailable(dead_chain):
    with pytest.raises(ChainUnavailable):
        dead_chain.get_latest("note", 1)
    with pytest.raises(ChainUnavailable):
        dead_chain.anchor("note", 1, H1)
```

- [ ] **Step 2: Run and confirm failure**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_chain.py -v`
Expected: failures such as `AttributeError`/`TypeError` because the temporary `Chain` has no methods (or all skipped if the node is not running: if so, start `npx hardhat node` in `blockchain/` and deploy first).

- [ ] **Step 3: Implement `python/chain.py`**

```python
import json

from web3 import Web3

import settings


class ChainUnavailable(Exception):
    """The blockchain node cannot be reached, or the contract is not deployed."""


class Chain:
    """The only place that talks to the blockchain."""

    def __init__(self, rpc_url=None, deployment_file=None):
        self._rpc_url = rpc_url or settings.rpc_url()
        self._deployment_file = deployment_file or settings.deployment_file()
        self._w3 = None
        self._contract = None

    def connect(self):
        if self._contract is not None:
            return self._w3, self._contract
        w3 = Web3(Web3.HTTPProvider(self._rpc_url))
        if not w3.is_connected():
            raise ChainUnavailable(f"Blockchain node not reachable at {self._rpc_url}")
        with open(self._deployment_file) as f:
            deployment = json.load(f)
        address = Web3.to_checksum_address(deployment["address"])
        if not w3.eth.get_code(address):
            raise ChainUnavailable(
                f"No contract at {address}. The local chain was probably restarted: redeploy.")
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

    def anchor(self, record_type, record_id, digest):
        def act(w3, contract):
            # Dev node only: its first account is unlocked and is the contract owner.
            tx = contract.functions.anchorHash(record_type, record_id, digest).transact(
                {"from": w3.eth.accounts[0]})
            receipt = w3.eth.wait_for_transaction_receipt(tx)
            events = contract.events.HashAnchored().process_receipt(receipt)
            return {
                "tx_hash": w3.to_hex(tx),
                "block_number": receipt["blockNumber"],
                "version": events[0]["args"]["version"],
            }
        return self._run(act)

    def mark_deleted(self, record_type, record_id):
        def act(w3, contract):
            tx = contract.functions.markDeleted(record_type, record_id).transact(
                {"from": w3.eth.accounts[0]})
            w3.eth.wait_for_transaction_receipt(tx)
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
            logs = contract.events.HashAnchored().get_logs(from_block=0)
            return {(e["args"]["recordType"], e["args"]["recordId"]) for e in logs}
        return self._run(act)

    # Development-node helpers (used by tests to reset state between tests).
    def snapshot(self):
        return self._run(lambda w3, c: w3.provider.make_request("evm_snapshot", [])["result"])

    def revert(self, snapshot_id):
        self._run(lambda w3, c: w3.provider.make_request("evm_revert", [snapshot_id]))
```

- [ ] **Step 4: Run chain tests**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_chain.py -v`
Expected: 7 passed with the node running. If any web3 behaviour differs from the "verified facts" above, fix `chain.py` (never weaken a test) and record the difference in the journal.

- [ ] **Step 5: Journal `docs/journal/13-chain.md`, then commit**

Explain: transaction vs call, why `anchor` waits for the receipt, why version comes from the event, why `transact` with `accounts[0]` only works on a dev node (Phase 7 replaces it with local signing), why the chain object is passed in (testability), and snapshot/revert.

```bash
git add python/chain.py python/tests/test_chain.py docs/journal/13-chain.md
git commit -m "feat: add chain access module and tests"
```

---

### Task 5.3: Database, integrity service and stand-in app (TDD, the core)

**Files:**
- Create: `python/tests/test_integrity.py`, `python/integrity.py`, `python/notes.py`
- Replace: `python/db.py`

**Interfaces:**
- Consumes: `hashing.canonical_bytes`, `hashing.keyed_hash`, `chain.Chain` methods, `chain.ChainUnavailable`.
- Produces:
  - `db.connect(path: str = ":memory:") -> sqlite3.Connection` (row_factory `sqlite3.Row`, tables created)
  - `integrity.RECORD_SPECS: dict`
  - `integrity.fetch_record(conn, record_type, record_id) -> dict | None`
  - `integrity.compute_digest(record_type, record) -> bytes`
  - `integrity.anchor_record(conn, chain, record_type, record_id) -> dict` (the `chain.anchor` result)
  - `integrity.verify_record(conn, chain, record_type, record_id) -> dict` with `status` in `VERIFIED, TAMPERED, MISSING_FROM_DB, DELETED_AUTHORIZED, NOT_ANCHORED, INCONSISTENT, UNAVAILABLE`, plus `record_type`, `record_id`, and (when reachable) `version`, `anchored_at_unix`
  - `integrity.verify_all(conn, chain, record_type) -> {"summary": {status: count}, "results": [...]}`
  - `notes.IntegrityRefused(Exception)`
  - `notes.create_note(conn, chain, interaction_id: int, content: str) -> {"noteid": int, "anchored": bool}`
  - `notes.update_note(conn, chain, note_id: int, content: str) -> {"noteid": int, "version": int}`
  - `notes.delete_note(conn, chain, note_id: int) -> None`

**Design notes (write these into the journal):**
1. *Create is fail-open:* the note is saved even if anchoring fails; the record then reports `NOT_ANCHORED`, which is honest.
2. *Update and delete are fail-closed.* If the chain is down while we update, the database would change but the chain would still hold the old hash, so the record would falsely look `TAMPERED`. So `update_note` only proceeds when the status is `VERIFIED` or `NOT_ANCHORED`; `TAMPERED`, `INCONSISTENT`, `MISSING_FROM_DB`, `DELETED_AUTHORIZED` and `UNAVAILABLE` all refuse. Delete marks the chain first and only then removes the row.
3. *`integrity_log` has no UNIQUE constraint* (the PDF has one). It is only a convenience copy; a failed insert after a successful chain write would be worse than a duplicate row, and a reset local chain would otherwise cause collisions.
4. *`verify_all` takes ids from chain events plus the database*, so a row deleted together with its log entry is still caught.

- [ ] **Step 1: Write the failing tests**

`python/tests/test_integrity.py`:
```python
import pytest

import integrity
import notes
from chain import ChainUnavailable


def make_note(conn, chain, content="Doctor appointment at 10:00 AM", interaction_id=1):
    return notes.create_note(conn, chain, interaction_id, content)["noteid"]


def status(conn, chain, note_id):
    return integrity.verify_record(conn, chain, "note", note_id)["status"]


def test_create_anchors_and_verifies(conn, chain):
    result = notes.create_note(conn, chain, 1, "hello")
    assert result["anchored"] is True
    assert status(conn, chain, result["noteid"]) == "VERIFIED"
    rows = conn.execute("SELECT version, record_hash FROM integrity_log").fetchall()
    assert len(rows) == 1 and rows[0]["version"] == 1 and len(rows[0]["record_hash"]) == 64


def test_never_anchored_record_is_not_anchored(conn, chain):
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (1, 'raw')")
    conn.commit()
    assert status(conn, chain, cur.lastrowid) == "NOT_ANCHORED"


def test_silent_edit_is_tampered(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"


def test_editing_an_unprotected_column_is_not_detected(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET created_at = '1999-01-01' WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "VERIFIED"   # documents the limitation: only listed fields


def test_silent_delete_is_missing_from_db(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("DELETE FROM note WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "MISSING_FROM_DB"


def test_authorised_delete(conn, chain):
    nid = make_note(conn, chain)
    notes.delete_note(conn, chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 0
    assert status(conn, chain, nid) == "DELETED_AUTHORIZED"


def test_deleted_on_chain_but_row_still_present_is_inconsistent(conn, chain):
    nid = make_note(conn, chain)
    chain.mark_deleted("note", nid)
    assert status(conn, chain, nid) == "INCONSISTENT"


def test_legitimate_edit_creates_version_two(conn, chain):
    nid = make_note(conn, chain)
    result = notes.update_note(conn, chain, nid, "Appointment moved to 11:00 AM")
    assert result["version"] == 2
    assert status(conn, chain, nid) == "VERIFIED"


def test_rollback_attack_is_detected(conn, chain):
    nid = make_note(conn, chain, content="original")
    notes.update_note(conn, chain, nid, "edited")
    conn.execute("UPDATE note SET content = 'original' WHERE noteid = ?", (nid,))   # restore v1
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"      # only the latest version is valid


def test_update_is_refused_on_a_tampered_record(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'tampered' WHERE noteid = ?", (nid,))
    conn.commit()
    with pytest.raises(notes.IntegrityRefused):
        notes.update_note(conn, chain, nid, "legit edit")
    content = conn.execute("SELECT content FROM note WHERE noteid = ?", (nid,)).fetchone()[0]
    assert content == "tampered"                       # not "blessed" with a new anchor
    assert chain.get_latest("note", nid)["version"] == 1


def test_attacker_who_also_rewrites_integrity_log_is_still_caught(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'tampered' WHERE noteid = ?", (nid,))
    forged = integrity.compute_digest("note", integrity.fetch_record(conn, "note", nid)).hex()
    conn.execute("UPDATE integrity_log SET record_hash = ?", (forged,))
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"      # the chain, not the log, is the authority


def test_verify_all_summary(conn, chain):
    ids = [make_note(conn, chain, content=f"note {i}", interaction_id=i) for i in range(3)]
    conn.execute("UPDATE note SET content = 'x' WHERE noteid = ?", (ids[1],))
    conn.commit()
    report = integrity.verify_all(conn, chain, "note")
    assert report["summary"] == {"VERIFIED": 2, "TAMPERED": 1}


def test_verify_all_catches_row_deleted_together_with_its_log_entries(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("DELETE FROM note WHERE noteid = ?", (nid,))
    conn.execute("DELETE FROM integrity_log")           # attacker cleans up the local log too
    conn.commit()
    report = integrity.verify_all(conn, chain, "note")
    assert report["summary"] == {"MISSING_FROM_DB": 1}  # id came from chain events


def test_unreachable_chain_is_unavailable_never_verified(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    assert status(conn, dead_chain, nid) == "UNAVAILABLE"


def test_create_still_saves_when_chain_is_down(conn, chain, dead_chain):
    result = notes.create_note(conn, dead_chain, 1, "saved anyway")
    assert result["anchored"] is False
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 1
    assert status(conn, chain, result["noteid"]) == "NOT_ANCHORED"


def test_update_is_refused_when_chain_is_down(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    with pytest.raises(notes.IntegrityRefused):
        notes.update_note(conn, dead_chain, nid, "should not happen")
    content = conn.execute("SELECT content FROM note WHERE noteid = ?", (nid,)).fetchone()[0]
    assert content == "Doctor appointment at 10:00 AM"


def test_deleting_a_never_anchored_note_works(conn, chain, dead_chain):
    nid = notes.create_note(conn, dead_chain, 1, "never anchored")["noteid"]
    notes.delete_note(conn, chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 0


def test_delete_is_refused_when_chain_is_down(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    with pytest.raises(ChainUnavailable):
        notes.delete_note(conn, dead_chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 1


def test_unicode_survives_a_database_round_trip(conn, chain):
    nid = make_note(conn, chain, content="café 日本語 ́")
    assert status(conn, chain, nid) == "VERIFIED"


def test_unknown_record_type_is_rejected(conn, chain):
    with pytest.raises(ValueError):
        integrity.verify_record(conn, chain, "users; DROP TABLE note", 1)
```

- [ ] **Step 2: Run and confirm failure**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_integrity.py -v`
Expected: collection error `ModuleNotFoundError: No module named 'integrity'` (and `notes`).

- [ ] **Step 3: Replace `python/db.py`**

```python
import sqlite3


def connect(path=":memory:"):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


def init_db(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS note (
        noteid        INTEGER PRIMARY KEY AUTOINCREMENT,
        interactionid INTEGER NOT NULL,
        content       TEXT    NOT NULL,
        created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS integrity_log (
        log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
        record_type  TEXT    NOT NULL,
        record_id    INTEGER NOT NULL,
        version      INTEGER NOT NULL,
        record_hash  TEXT    NOT NULL,
        tx_hash      TEXT,
        block_number INTEGER,
        anchored_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()
```

- [ ] **Step 4: Implement `python/integrity.py`**

```python
import hmac

from hashing import canonical_bytes, keyed_hash
from chain import ChainUnavailable

# Whitelist: table and column names are never taken from user input.
RECORD_SPECS = {
    "note": {"table": "note", "pk": "noteid",
             "fields": ["noteid", "interactionid", "content"]},
}


def _spec(record_type):
    if record_type not in RECORD_SPECS:
        raise ValueError(f"Unknown record type: {record_type!r}")
    return RECORD_SPECS[record_type]


def fetch_record(conn, record_type, record_id):
    spec = _spec(record_type)
    # Names come from the whitelist above; the value goes through a ? placeholder.
    sql = f"SELECT {', '.join(spec['fields'])} FROM {spec['table']} WHERE {spec['pk']} = ?"
    row = conn.execute(sql, (record_id,)).fetchone()
    return dict(row) if row else None


def compute_digest(record_type, record):
    return keyed_hash(canonical_bytes(record_type, record, _spec(record_type)["fields"]))


def anchor_record(conn, chain, record_type, record_id):
    record = fetch_record(conn, record_type, record_id)
    if record is None:
        raise ValueError("Record not found")
    digest = compute_digest(record_type, record)
    result = chain.anchor(record_type, record_id, digest)
    # The local log is a convenience copy only. Verification never reads it.
    conn.execute(
        "INSERT INTO integrity_log (record_type, record_id, version, record_hash, "
        "tx_hash, block_number) VALUES (?, ?, ?, ?, ?, ?)",
        (record_type, record_id, result["version"], digest.hex(),
         result["tx_hash"], result["block_number"]))
    conn.commit()
    return result


def verify_record(conn, chain, record_type, record_id):
    _spec(record_type)
    base = {"record_type": record_type, "record_id": record_id}
    try:
        latest = chain.get_latest(record_type, record_id)
    except ChainUnavailable:
        return {**base, "status": "UNAVAILABLE"}

    record = fetch_record(conn, record_type, record_id)
    if latest["version"] == 0:
        status = "NOT_ANCHORED"
    elif record is None:
        status = "DELETED_AUTHORIZED" if latest["is_deleted"] else "MISSING_FROM_DB"
    elif latest["is_deleted"]:
        status = "INCONSISTENT"
    else:
        same = hmac.compare_digest(compute_digest(record_type, record), latest["hash"])
        status = "VERIFIED" if same else "TAMPERED"
    return {**base, "status": status, "version": latest["version"],
            "anchored_at_unix": latest["timestamp"]}


def verify_all(conn, chain, record_type):
    spec = _spec(record_type)
    db_ids = {row[0] for row in conn.execute(f"SELECT {spec['pk']} FROM {spec['table']}")}
    try:
        # Ids from the chain's own event logs, so a row deleted together with its
        # integrity_log entries is still found.
        chain_ids = {rid for (rtype, rid) in chain.anchored_records() if rtype == record_type}
    except ChainUnavailable:
        chain_ids = set()      # each database id below will report UNAVAILABLE
    results = [verify_record(conn, chain, record_type, i) for i in sorted(db_ids | chain_ids)]
    summary = {}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    return {"summary": summary, "results": results}
```

- [ ] **Step 5: Implement `python/notes.py`**

```python
import logging

import integrity

log = logging.getLogger(__name__)


class IntegrityRefused(Exception):
    """An update was refused because the record's integrity could not be confirmed."""


def create_note(conn, chain, interaction_id, content):
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                       (interaction_id, content))
    conn.commit()
    note_id = cur.lastrowid
    try:                               # fail-open: anchoring must never block a save
        integrity.anchor_record(conn, chain, "note", note_id)
        anchored = True
    except Exception as exc:
        log.warning("Anchoring failed for note %s: %s", note_id, exc)
        anchored = False
    return {"noteid": note_id, "anchored": anchored}


def update_note(conn, chain, note_id, content):
    # Verify-before-update guard (PDF 7.6), fail-closed.
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status not in ("VERIFIED", "NOT_ANCHORED"):
        raise IntegrityRefused(f"Update refused: record status is {status}")
    conn.execute("UPDATE note SET content = ? WHERE noteid = ?", (content, note_id))
    conn.commit()
    result = integrity.anchor_record(conn, chain, "note", note_id)
    return {"noteid": note_id, "version": result["version"]}


def delete_note(conn, chain, note_id):
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status != "NOT_ANCHORED":
        chain.mark_deleted("note", note_id)      # chain first; raises ChainUnavailable if down
    conn.execute("DELETE FROM note WHERE noteid = ?", (note_id,))
    conn.commit()
```

Note: `delete_note` on a chain that is down returns status `UNAVAILABLE`, so `chain.mark_deleted` runs and raises `ChainUnavailable`, leaving the row in place (the test expects exactly this).

- [ ] **Step 6: Run the integrity tests, then everything**

Run (from `python/`): `.venv/Scripts/python.exe -m pytest tests/test_integrity.py -v`
Expected: 20 passed.
Then: `.venv/Scripts/python.exe -m pytest -v`
Expected: 15 hashing + 7 chain + 20 integrity = 42 passed.

- [ ] **Step 7: Mutation checks (prove the tests catch bugs)**

Do each separately, run `tests/test_integrity.py`, confirm the named test fails, then restore the file:
1. In `verify_record` change `compare_digest(...)` to `True` : expect `test_silent_edit_is_tampered` and `test_rollback_attack_is_detected` to fail.
2. In `update_note` change the guard so `TAMPERED` is allowed: expect `test_update_is_refused_on_a_tampered_record` to fail.
3. In `verify_all` set `chain_ids = set()` always: expect `test_verify_all_catches_row_deleted_together_with_its_log_entries` to fail.

- [ ] **Step 8: Journal `docs/journal/14-integrity.md`, then commit**

Include the four design notes above, the seven-status table, the test-to-PDF mapping (T1-T4, T6-T8, T10-T12 plus the extra attacker-edits-the-log case), and the mutation results.

```bash
git add python/db.py python/integrity.py python/notes.py python/tests/test_integrity.py docs/journal/14-integrity.md
git commit -m "feat: add integrity service, stand-in notes app and tests"
```

---

### Task 5.4: Command-line demo

**Files:**
- Create: `python/demo.py`

**Interfaces:** Consumes everything above. Produces printed output only.

- [ ] **Step 1: Write the demo**

```python
"""Command-line demo of the full story (PDF 9.3).

Requires: `npx hardhat node` running and the contract deployed.
Run (from python/):  .venv/Scripts/python.exe demo.py
The chain is rolled back at the end so the demo can be run again.
"""
import sys

import db
import integrity
import notes
from chain import Chain, ChainUnavailable


def show(conn, chain, note_id, label):
    r = integrity.verify_record(conn, chain, "note", note_id)
    print(f"  {label:<48} -> {r['status']}")


def sql(conn, statement, params=()):
    conn.execute(statement, params)
    conn.commit()


def main(keep=False):
    chain = Chain()
    try:
        chain.connect()
    except ChainUnavailable as exc:
        sys.exit(f"Cannot run demo: {exc}")
    snapshot = chain.snapshot()
    conn = db.connect(":memory:")

    print("1. Create three notes. Each is saved in the database and its hash anchored on-chain.")
    a = notes.create_note(conn, chain, 1, "Doctor appointment on 20 April at 10:00 AM")
    b = notes.create_note(conn, chain, 2, "Call Anna about the birthday party")
    c = notes.create_note(conn, chain, 3, "Buy milk and bread")
    print(f"  created notes {a['noteid']}, {b['noteid']}, {c['noteid']}  (anchored: "
          f"{a['anchored']}, {b['anchored']}, {c['anchored']})")
    tx = conn.execute("SELECT tx_hash, block_number FROM integrity_log LIMIT 1").fetchone()
    print(f"  first proof: tx {tx['tx_hash'][:18]}... in block {tx['block_number']}")

    print("\n2. Verify the untouched note.")
    show(conn, chain, a["noteid"], "note 1, untouched")

    print("\n3. Someone edits note 1 directly in the database, bypassing the app.")
    sql(conn, "UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (a["noteid"],))
    show(conn, chain, a["noteid"], "note 1 after silent edit")

    print("\n4. The app refuses to edit the tampered note (it would bless the forgery).")
    try:
        notes.update_note(conn, chain, a["noteid"], "legit edit")
    except notes.IntegrityRefused as exc:
        print(f"  refused: {exc}")

    print("\n5. A legitimate edit through the app on a clean note creates version 2.")
    r = notes.update_note(conn, chain, b["noteid"], "Call Anna about the party on Saturday")
    print(f"  note 2 re-anchored as version {r['version']}")
    show(conn, chain, b["noteid"], "note 2 after legitimate edit")

    print("\n6. Rollback attack: restore note 2's ORIGINAL text behind the app's back.")
    sql(conn, "UPDATE note SET content = 'Call Anna about the birthday party' WHERE noteid = ?",
        (b["noteid"],))
    show(conn, chain, b["noteid"], "note 2 restored to its version-1 text")

    print("\n7. Someone silently deletes note 3, and also wipes the local integrity log.")
    sql(conn, "DELETE FROM note WHERE noteid = ?", (c["noteid"],))
    sql(conn, "DELETE FROM integrity_log")
    show(conn, chain, c["noteid"], "note 3 after silent delete")

    print("\n8. Check everything at once (ids come from the chain's event logs).")
    report = integrity.verify_all(conn, chain, "note")
    print(f"  summary: {report['summary']}")

    print("\n9. Authorised delete through the app on a fresh note.")
    d = notes.create_note(conn, chain, 4, "Temporary note")
    notes.delete_note(conn, chain, d["noteid"])
    show(conn, chain, d["noteid"], "note 4 after authorised delete")

    if not keep:
        chain.revert(snapshot)
        print("\n(chain rolled back; run with --keep to leave the anchors in place)")


if __name__ == "__main__":
    main(keep="--keep" in sys.argv)
```

- [ ] **Step 2: Run it**

Run (from `python/`): `.venv/Scripts/python.exe demo.py`
Expected statuses, in order: note 1 untouched `VERIFIED`; after silent edit `TAMPERED`; update refused message; note 2 re-anchored as version 2 and `VERIFIED`; note 2 restored text `TAMPERED`; note 3 after silent delete `MISSING_FROM_DB`; summary `{'TAMPERED': 2, 'MISSING_FROM_DB': 1}`; note 4 `DELETED_AUTHORIZED`. Run it twice to confirm it is repeatable.

- [ ] **Step 3: Journal `docs/journal/15-demo.md`** with the real output pasted in, a line-by-line explanation of what each step proves, and an honest note on what the demo does NOT show (a single local node, one trusted owner key).

- [ ] **Step 4: Tick Phase 5 in the master plan and commit**

```bash
git add python/demo.py docs/journal/15-demo.md docs/00-master-plan.md
git commit -m "feat: add command-line demo of tamper detection"
```

---

## Self-review

- **Spec coverage:** PDF tests T1 (create anchors), T2 (verify), T3 (silent edit), T4 (legitimate edit), T5 (update refused on tampered), T6 (silent delete), T7 (authorised delete), T8 (rollback), T10 (chain down), T12 (Unicode/timestamps) are all covered. T9 (retry queue) and T13 (batch endpoint) were cut deliberately; `verify_all` covers the batch idea. T11 (non-owner) is in the contract tests. Extra cases added: attacker also edits `integrity_log`, row and log both deleted, unprotected-column edit, fail-closed update and delete.
- **Placeholders:** none. The temporary `chain.py` and `db.py` stubs in Task 5.1 are fully written and replaced in 5.2 and 5.3.
- **Type consistency:** `Chain` method names and return keys (`tx_hash`, `block_number`, `version`, `hash`, `timestamp`, `is_deleted`) match across `chain.py`, `integrity.py`, the tests and `demo.py`; status strings are identical everywhere; `compute_digest` and `fetch_record` are used by the tests exactly as defined.
- **Test count:** 15 + 7 + 20 = 42 (counted from the test files above).
- **Known step-4 wrinkle in Task 5.1:** with `conftest.py` importing `chain` and `db`, the "failing first" run uses `--noconftest`, so the failure shown is `No module named 'hashing'`.
