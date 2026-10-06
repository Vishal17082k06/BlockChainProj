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
