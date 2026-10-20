import pytest
from eth_utils import keccak

from merkle import MerkleTree, verify_proof
from merkle_chain import MerkleChain
from chain import ChainUnavailable


def leaves(n, prefix="record"):
    return [keccak(f"{prefix} {i}".encode()) for i in range(n)]


def test_anchor_root_then_get_batch(merkle_chain):
    tree = MerkleTree(leaves(5))
    result = merkle_chain.anchor_root(tree.root, 5)
    assert result["batch_id"] == 0
    assert result["gas_used"] > 0
    batch = merkle_chain.get_batch(0)
    assert batch["root"] == tree.root and batch["count"] == 5 and batch["timestamp"] > 0


def test_batches_are_numbered_sequentially(merkle_chain):
    assert merkle_chain.anchor_root(MerkleTree(leaves(2)).root, 2)["batch_id"] == 0
    assert merkle_chain.anchor_root(MerkleTree(leaves(3)).root, 3)["batch_id"] == 1
    assert merkle_chain.batch_count() == 2


def test_python_proofs_are_accepted_by_the_solidity_contract(merkle_chain):
    # The cross-language check: same hashing rules in Python and Solidity.
    for size in (1, 2, 3, 7, 8, 13):
        items = leaves(size, prefix=f"size{size}")
        tree = MerkleTree(items)
        batch_id = merkle_chain.anchor_root(tree.root, size)["batch_id"]
        for i, item in enumerate(items):
            proof = tree.proof(i)
            assert verify_proof(item, proof, tree.root)
            assert merkle_chain.verify_on_chain(batch_id, item, proof), (size, i)


def test_contract_rejects_a_leaf_that_is_not_in_the_batch(merkle_chain):
    items = leaves(7)
    tree = MerkleTree(items)
    batch_id = merkle_chain.anchor_root(tree.root, 7)["batch_id"]
    assert not merkle_chain.verify_on_chain(batch_id, keccak(b"forged"), tree.proof(2))


def test_old_batch_still_verifies_old_content__documented_limitation(merkle_chain):
    # Batching has no "latest version" rule: an edited record's OLD content still
    # verifies against the OLD batch. A per-record contract would reject it (Step 07).
    old = keccak(b"note 1: original text")
    new = keccak(b"note 1: edited text")
    filler = keccak(b"another record")
    batch_a = merkle_chain.anchor_root(MerkleTree([old, filler]).root, 2)["batch_id"]
    merkle_chain.anchor_root(MerkleTree([new, filler]).root, 2)           # the edit, anchored later
    assert merkle_chain.verify_on_chain(batch_a, old, MerkleTree([old, filler]).proof(0))


def test_unreachable_node_raises_chain_unavailable():
    dead = MerkleChain(rpc_url="http://127.0.0.1:9")
    with pytest.raises(ChainUnavailable):
        dead.batch_count()
