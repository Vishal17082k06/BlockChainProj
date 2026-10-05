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
