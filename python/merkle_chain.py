import settings
from chain import Chain


class MerkleChain(Chain):
    """Talks to the MerkleRegistry contract. Reuses Chain's connection handling."""

    def __init__(self, rpc_url=None, deployment_file=None):
        super().__init__(rpc_url=rpc_url,
                         deployment_file=deployment_file or settings.merkle_deployment_file())

    def anchor_root(self, root, count):
        def act(w3, contract):
            tx = contract.functions.anchorRoot(root, count).transact({"from": w3.eth.accounts[0]})
            receipt = w3.eth.wait_for_transaction_receipt(tx)
            events = contract.events.RootAnchored().process_receipt(receipt)
            return {
                "batch_id": events[0]["args"]["batchId"],
                "tx_hash": w3.to_hex(tx),
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
