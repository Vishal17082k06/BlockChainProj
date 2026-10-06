"""Print ready-to-paste test inputs for trying our contracts by hand in Remix.

Uses the fixed TEACHING key (not your real secret), so the values are the same on every
machine. Every value is checked here before it is printed. No blockchain needed.
Run from the repository root:
    .\\python\\.venv\\Scripts\\python.exe experiments\\remix_inputs.py
"""
import json
import os
import sys
from pathlib import Path

os.environ["INTEGRITY_SECRET_KEY"] = "teaching-key-not-a-secret"      # before importing the project
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))

import integrity                                                    # noqa: E402
import merkle                                                       # noqa: E402


def digest(note_id, interaction_id, content):
    record = {"noteid": note_id, "interactionid": interaction_id, "content": content}
    return integrity.compute_digest("note", record)


def hx(b):
    return "0x" + b.hex()


def main():
    # ---- IntegrityRegistry -------------------------------------------------------------
    original = digest(1, 1, "Doctor appointment on 20 April at 10:00 AM")
    edited = digest(1, 1, "Doctor appointment on 20 April at 10:30 AM")
    assert original != edited and len(original) == 32

    print("=== IntegrityRegistry (record type, record id, hash) ===")
    print('anchorHash   "note",1,' + hx(original))
    print('verify       "note",1,' + hx(original) + "     -> expect true")
    print('verify       "note",1,' + hx(edited) + "     -> expect false (the 10:30 edit)")
    print('getLatest    "note",1                  -> expect hash above, version 1, isDeleted false')
    print('versionCount "note",1                  -> expect 1')
    print('anchorHash   "note",1,' + hx(edited) + "     (second version, after the edit)")
    print('verify       "note",1,' + hx(edited) + "     -> expect true")
    print('verify       "note",1,' + hx(original) + "     -> expect false (old version no longer valid)")
    print('markDeleted  "note",1')
    print('verify       "note",1,' + hx(edited) + "     -> expect false (deleted)")

    # ---- MerkleRegistry ----------------------------------------------------------------
    contents = [f"Note number {i}" for i in range(1, 9)]
    leaves = [digest(i, i, c) for i, c in enumerate(contents, start=1)]
    tree = merkle.MerkleTree(leaves)
    target = 2                                                  # the third note
    proof = tree.proof(target)
    tampered = digest(3, 3, "Appointment cancelled")
    assert merkle.verify_proof(leaves[target], proof, tree.root)            # self-check
    assert not merkle.verify_proof(tampered, proof, tree.root)

    print("\n=== MerkleRegistry (8 notes anchored with ONE transaction) ===")
    print("anchorRoot   " + hx(tree.root) + ",8")
    print("batchCount                             -> expect 1")
    print("getBatch     0                         -> expect the root above, 8")
    print("verify       0," + hx(leaves[target]) + ",")
    print("             " + json.dumps([hx(p) for p in proof]) + "     -> expect true")
    print("verify       0," + hx(tampered) + ",")
    print("             " + json.dumps([hx(p) for p in proof]) + "     -> expect false (note 3 edited)")


if __name__ == "__main__":
    main()
