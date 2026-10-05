import pytest
from eth_utils import keccak

from merkle import MerkleTree, leaf_hash, node_hash, verify_proof


def leaves(n):
    return [keccak(f"record {i}".encode()) for i in range(n)]


def test_single_leaf_root_is_its_leaf_hash_and_proof_is_empty():
    (a,) = leaves(1)
    tree = MerkleTree([a])
    assert tree.root == leaf_hash(a)
    assert tree.proof(0) == []
    assert verify_proof(a, [], tree.root)


def test_two_leaves_root_follows_the_documented_formula():
    a, b = leaves(2)
    la = keccak(b"\x00" + a)
    lb = keccak(b"\x00" + b)
    lo, hi = sorted([la, lb])
    expected = keccak(b"\x01" + lo + hi)
    assert MerkleTree([a, b]).root == expected


def test_every_leaf_verifies_for_every_size_from_1_to_33():
    for size in range(1, 34):
        items = leaves(size)
        tree = MerkleTree(items)
        for i, item in enumerate(items):
            assert verify_proof(item, tree.proof(i), tree.root), (size, i)


def test_wrong_leaf_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(keccak(b"not in the tree"), tree.proof(3), tree.root)


def test_wrong_root_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(items[3], tree.proof(3), keccak(b"another root"))


def test_tampered_proof_element_fails():
    items = leaves(8)
    tree = MerkleTree(items)
    proof = tree.proof(3)
    flipped = bytes([proof[0][0] ^ 0x01]) + proof[0][1:]
    assert not verify_proof(items[3], [flipped] + proof[1:], tree.root)


def test_proof_for_one_leaf_does_not_verify_another_leaf():
    items = leaves(8)
    tree = MerkleTree(items)
    assert not verify_proof(items[4], tree.proof(3), tree.root)


def test_odd_leaf_count_is_not_confused_with_a_duplicated_last_leaf():
    a, b, c = leaves(3)
    assert MerkleTree([a, b, c]).root != MerkleTree([a, b, c, c]).root


def test_an_internal_node_value_is_not_accepted_as_a_leaf():
    # Second-preimage attempt: present an internal node as if it were a record.
    # This holds even WITHOUT the 0x00/0x01 prefixes, because leaves are fixed at 32
    # bytes (a leaf hash covers 33 bytes, an internal node 65, so they can never be equal).
    # The prefixes are defence in depth, pinned by the formula test above, and would
    # matter if variable-length leaves were ever allowed.
    a, b, c, d = leaves(4)
    tree = MerkleTree([a, b, c, d])
    n01 = node_hash(leaf_hash(a), leaf_hash(b))
    n23 = node_hash(leaf_hash(c), leaf_hash(d))
    assert node_hash(n01, n23) == tree.root           # sanity: our reading of the tree is right
    assert not verify_proof(n01, [n23], tree.root)


def test_same_leaves_give_the_same_root():
    assert MerkleTree(leaves(10)).root == MerkleTree(leaves(10)).root


def test_order_within_a_pair_is_irrelevant_but_across_pairs_matters():
    a, b, c, d = leaves(4)
    assert MerkleTree([a, b, c, d]).root == MerkleTree([b, a, c, d]).root   # swap inside a pair
    assert MerkleTree([a, b, c, d]).root != MerkleTree([a, c, b, d]).root   # move across pairs


def test_empty_leaf_list_is_rejected():
    with pytest.raises(ValueError):
        MerkleTree([])


@pytest.mark.parametrize("bad", [b"", b"x" * 31, b"x" * 33, "a string"])
def test_leaves_must_be_exactly_32_bytes(bad):
    with pytest.raises(ValueError):
        leaf_hash(bad)


def test_proof_length_is_logarithmic():
    assert len(MerkleTree(leaves(8)).proof(0)) == 3
    assert len(MerkleTree(leaves(16)).proof(5)) == 4
    assert all(len(MerkleTree(leaves(100)).proof(i)) <= 7 for i in range(100))


def test_index_out_of_range_raises():
    tree = MerkleTree(leaves(4))
    with pytest.raises(IndexError):
        tree.proof(4)
    with pytest.raises(IndexError):
        tree.proof(-1)
