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
