"""Merkle batching demo: anchor 8 notes with ONE transaction, then prove one of them.

Requires: `npx hardhat node` running and MerkleRegistry deployed
(`npx hardhat run scripts/deploy_merkle.js --network localhost`).
Run (from python/):  .venv/Scripts/python.exe merkle_demo.py
"""
import sys

import db
import integrity
import merkle
from chain import ChainUnavailable
from merkle_chain import MerkleChain


def main():
    chain = MerkleChain()
    try:
        chain.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        sys.exit(f"Cannot run demo: {exc}")
    snapshot = chain.snapshot()
    conn = db.connect(":memory:")

    ids = []
    for i in range(1, 9):
        cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                           (i, f"Note number {i}"))
        ids.append(cur.lastrowid)
    conn.commit()

    print("1. Hash all 8 notes and build a Merkle tree.")
    digests = [integrity.compute_digest("note", integrity.fetch_record(conn, "note", i)) for i in ids]
    tree = merkle.MerkleTree(digests)
    print(f"  root: 0x{tree.root.hex()[:24]}...")

    print("\n2. Anchor the single root: ONE transaction covers all 8 notes.")
    result = chain.anchor_root(tree.root, len(digests))
    print(f"  batch {result['batch_id']}, block {result['block_number']}, gas used {result['gas_used']}")

    target = 2                               # the third note
    proof = tree.proof(target)
    print(f"\n3. To prove note {ids[target]} we need only {len(proof)} sibling hashes "
          f"({len(proof) * 32} bytes), not the other notes.")

    def check(label):
        record = integrity.fetch_record(conn, "note", ids[target])
        digest = integrity.compute_digest("note", record)
        root = chain.get_batch(result["batch_id"])["root"]
        in_python = merkle.verify_proof(digest, proof, root)
        on_chain = chain.verify_on_chain(result["batch_id"], digest, proof)
        verdict = lambda ok: "VERIFIED" if ok else "TAMPERED"
        print(f"  {label:<36} python: {verdict(in_python):<9} | contract: {verdict(on_chain)}")

    print("\n4. Verify note 3 against the on-chain root.")
    check("note 3, untouched")

    print("\n5. Someone edits note 3 in the database. Verify again.")
    conn.execute("UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (ids[target],))
    conn.commit()
    check("note 3 after silent edit")

    chain.revert(snapshot)
    print("\n(chain rolled back so the demo can be repeated)")


if __name__ == "__main__":
    main()
