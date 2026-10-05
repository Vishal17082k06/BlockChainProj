from eth_utils import keccak

LEAF_PREFIX = b"\x00"
NODE_PREFIX = b"\x01"


def _check_leaf(leaf):
    if not isinstance(leaf, (bytes, bytearray)) or len(leaf) != 32:
        raise ValueError("A leaf must be exactly 32 bytes")


def leaf_hash(leaf: bytes) -> bytes:
    _check_leaf(leaf)
    return keccak(LEAF_PREFIX + bytes(leaf))


def node_hash(a: bytes, b: bytes) -> bytes:
    lo, hi = (a, b) if a <= b else (b, a)      # sorted pair: proofs need no left/right flags
    return keccak(NODE_PREFIX + lo + hi)


class MerkleTree:
    def __init__(self, leaves):
        if not leaves:
            raise ValueError("Cannot build a tree with no leaves")
        level = [leaf_hash(leaf) for leaf in leaves]
        self._levels = [level]
        while len(level) > 1:
            upper = []
            for i in range(0, len(level), 2):
                if i + 1 < len(level):
                    upper.append(node_hash(level[i], level[i + 1]))
                else:
                    upper.append(level[i])     # unpaired node is promoted, never duplicated
            self._levels.append(upper)
            level = upper

    @property
    def root(self) -> bytes:
        return self._levels[-1][0]

    def __len__(self):
        return len(self._levels[0])

    def proof(self, index: int):
        if not 0 <= index < len(self):
            raise IndexError("leaf index out of range")
        siblings = []
        for level in self._levels[:-1]:
            sibling = index ^ 1                # the other child of the same parent
            if sibling < len(level):
                siblings.append(level[sibling])
            index //= 2
        return siblings


def verify_proof(leaf: bytes, proof, root: bytes) -> bool:
    computed = leaf_hash(leaf)
    for sibling in proof:
        computed = node_hash(computed, sibling)
    return computed == root
