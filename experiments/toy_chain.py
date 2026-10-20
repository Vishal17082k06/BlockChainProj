"""Experiment 1.2: a tiny blockchain, and what tampering does to it.

Run:  python toy_chain.py
Standard library only.
"""
import hashlib
import json
import time

DIFFICULTY = 4  # a valid hash must start with this many zeros (proof-of-work)


def compute_hash(block: dict) -> str:
    """Hash every field of the block except its own 'hash'."""
    body = {k: block[k] for k in ("index", "timestamp", "data", "prev_hash", "nonce")}
    text = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode()).hexdigest()


def mine(block: dict) -> dict:
    """Proof-of-work: try nonces until the hash starts with DIFFICULTY zeros."""
    block["nonce"] = 0
    while not compute_hash(block).startswith("0" * DIFFICULTY):
        block["nonce"] += 1
    block["hash"] = compute_hash(block)
    return block


def new_block(index: int, data: str, prev_hash: str) -> dict:
    return mine({"index": index, "timestamp": time.time(), "data": data,
                 "prev_hash": prev_hash})


def build_chain(messages: list) -> list:
    chain = [new_block(0, "genesis", "0" * 64)]
    for i, msg in enumerate(messages, start=1):
        chain.append(new_block(i, msg, chain[-1]["hash"]))
    return chain


def validate(chain: list):
    """Return (True, None) or (False, reason naming the first broken block)."""
    for i, block in enumerate(chain):
        if compute_hash(block) != block["hash"]:
            return False, f"block {i}: stored hash does not match its contents"
        if not block["hash"].startswith("0" * DIFFICULTY):
            return False, f"block {i}: proof-of-work missing"
        if i > 0 and block["prev_hash"] != chain[i - 1]["hash"]:
            return False, f"block {i}: prev_hash does not match block {i - 1}"
    return True, None


def show(chain: list):
    for b in chain:
        print(f"  #{b['index']} data={b['data']!r:32} prev={b['prev_hash'][:8]} "
              f"hash={b['hash'][:8]} nonce={b['nonce']}")


if __name__ == "__main__":
    print("=== 1. Build a valid chain ===")
    chain = build_chain(["note 1: doctor at 10:00",
                         "note 2: call Anna",
                         "note 3: buy milk",
                         "note 4: walk at 5pm"])
    show(chain)
    print("valid?", validate(chain))

    print("\n=== 2. Tamper with block 2's data (no other changes) ===")
    chain[2]["data"] = "note 2: call Anna AND send money"
    print("valid?", validate(chain))

    print("\n=== 3. Attacker re-mines block 2 so ITS hash is correct again ===")
    mine(chain[2])
    print("valid?", validate(chain))
    print("(block 3 still points at block 2's OLD hash, so the link breaks)")

    print("\n=== 4. Attacker re-mines every later block too ===")
    for i in range(3, len(chain)):
        chain[i]["prev_hash"] = chain[i - 1]["hash"]
        mine(chain[i])
    print("valid?", validate(chain))
    print("A lone attacker holding the only copy rewrote history successfully.")
    print("Real networks stop this: many independent nodes keep copies, and the")
    print("honest majority would reject the rewritten chain. One local node cannot.")
