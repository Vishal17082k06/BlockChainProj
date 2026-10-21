import json

from web3 import Web3

import settings

# Networks we are willing to SIGN transactions on: Hardhat local and Sepolia. Never mainnet.
ALLOWED_SIGNING_CHAIN_IDS = frozenset({31337, 11155111})


class ChainUnavailable(Exception):
    """The blockchain node cannot be reached, or the contract is not deployed."""


class WrongNetwork(Exception):
    """Refusing to sign transactions on a network that is not an approved test network."""


class TransactionFailed(Exception):
    """A transaction was mined but failed on the chain (for example it ran out of gas)."""

    def __init__(self, tx_hash):
        super().__init__(f"The transaction {tx_hash} was mined but failed")
        self.tx_hash = tx_hash


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

    @property
    def address(self):
        """The deployed contract's address once connected, else None."""
        return self._contract.address if self._contract is not None else None

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

    def _send(self, w3, call, on_sent=None):
        """Send one contract call as a transaction. Returns (tx_hash, receipt).

        `on_sent(tx_hash_hex)` is called as soon as the transaction has been sent, BEFORE we
        wait for it to be mined, so a caller can show the hash while the network works.
        """
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
        if on_sent is not None:
            on_sent(w3.to_hex(tx_hash))
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
        if receipt["status"] != 1:
            raise TransactionFailed(w3.to_hex(tx_hash))
        return tx_hash, receipt

    @staticmethod
    def _cost(receipt):
        """Gas used and the exact fee in wei, from the receipt (never an estimate)."""
        return {"gas_used": receipt["gasUsed"],
                "fee_wei": receipt["gasUsed"] * receipt["effectiveGasPrice"]}

    def anchor(self, record_type, record_id, digest, on_sent=None):
        def act(w3, contract):
            tx_hash, receipt = self._send(
                w3, contract.functions.anchorHash(record_type, record_id, digest), on_sent)
            events = contract.events.HashAnchored().process_receipt(receipt)
            return {
                "tx_hash": w3.to_hex(tx_hash),
                "block_number": receipt["blockNumber"],
                "version": events[0]["args"]["version"],
                **self._cost(receipt),
            }
        return self._run(act)

    def mark_deleted(self, record_type, record_id, on_sent=None):
        def act(w3, contract):
            tx_hash, receipt = self._send(
                w3, contract.functions.markDeleted(record_type, record_id), on_sent)
            return {"tx_hash": w3.to_hex(tx_hash), "block_number": receipt["blockNumber"],
                    **self._cost(receipt)}
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

    def _logs(self, event, w3):
        """Every log of one event type, read in chunks from the deployment block."""
        latest = w3.eth.block_number
        for low in range(self._deployment_block, latest + 1, self.LOG_CHUNK):
            high = min(low + self.LOG_CHUNK - 1, latest)
            yield from event.get_logs(from_block=low, to_block=high)

    def history(self, record_type, record_id):
        """Everything the chain remembers about one record, from event logs only."""
        def act(w3, contract):
            def mine(entry):
                return (entry["args"]["recordType"] == record_type
                        and entry["args"]["recordId"] == record_id)

            versions = [
                {"version": e["args"]["version"], "hash": bytes(e["args"]["hash"]),
                 "timestamp": e["args"]["timestamp"], "tx_hash": w3.to_hex(e["transactionHash"]),
                 "block_number": e["blockNumber"]}
                for e in self._logs(contract.events.HashAnchored(), w3) if mine(e)
            ]
            versions.sort(key=lambda v: v["version"])
            deletion = next(
                ({"tx_hash": w3.to_hex(e["transactionHash"]), "block_number": e["blockNumber"],
                  "timestamp": e["args"]["timestamp"]}
                 for e in self._logs(contract.events.RecordMarkedDeleted(), w3) if mine(e)),
                None)
            return {"versions": versions, "deleted": deletion}
        return self._run(act)

    def _wallet(self, w3):
        """The address this object sends from: the signing key's, or the dev node's first account."""
        if self._private_key is not None:
            return w3.eth.account.from_key(self._private_key).address
        return w3.eth.accounts[0]

    def status(self):
        """Live facts about the chain and the wallet this object signs with."""
        def act(w3, contract):
            wallet = self._wallet(w3)
            return {"chain_id": w3.eth.chain_id, "block_number": w3.eth.block_number,
                    "wallet": wallet, "balance_wei": w3.eth.get_balance(wallet),
                    "owner": contract.functions.owner().call()}
        return self._run(act)

    def pulse(self):
        """The two numbers a live display polls: block height and the wallet's balance.

        Cheaper than `status()` (two requests, not four), so it is kind to free public servers.
        """
        def act(w3, contract):
            return {"block_number": w3.eth.block_number,
                    "balance_wei": w3.eth.get_balance(self._wallet(w3))}
        return self._run(act)

    # Development-node helpers (used by tests to reset state between tests).
    def snapshot(self):
        return self._run(lambda w3, c: w3.provider.make_request("evm_snapshot", [])["result"])

    def revert(self, snapshot_id):
        self._run(lambda w3, c: w3.provider.make_request("evm_revert", [snapshot_id]))
