"""A narrated tour of what happens to ONE note, stage by stage.

Needs the local node running and the contracts deployed (see docs/how-to-run.md).
Run from the repository root:
    .\\python\\.venv\\Scripts\\python.exe experiments\\life_of_a_note.py

It uses a fixed TEACHING key (not your real secret), so the hash values below are the
same on every machine. It rolls the chain back at the end, so it can be run repeatedly.
"""
import os
import sys
from pathlib import Path

os.environ["INTEGRITY_SECRET_KEY"] = "teaching-key-not-a-secret"      # before importing the project
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))

import db                                                           # noqa: E402
import integrity                                                    # noqa: E402
from chain import Chain, ChainUnavailable                           # noqa: E402
from hashing import canonical_bytes                                 # noqa: E402


def stage(number, title):
    print(f"\n=== Stage {number}: {title} ===")


def main():
    chain = Chain()
    try:
        chain.connect()
    except ChainUnavailable as exc:
        sys.exit(f"Cannot run: {exc}")
    snapshot = chain.snapshot()
    conn = db.connect(":memory:")

    stage(1, "A note is saved in the ordinary database (this is the data we want to protect)")
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                       (1, "Doctor appointment on 20 April at 10:00 AM"))
    conn.commit()
    note_id = cur.lastrowid
    record = integrity.fetch_record(conn, "note", note_id)
    print("  row in the database:", record)

    stage(2, "The row is turned into ONE exact string of text (canonical form)")
    fields = integrity.RECORD_SPECS["note"]["fields"]
    text = canonical_bytes("note", record, fields)
    print("  ", text.decode("utf-8"))
    print("  Same row in, same text out, every time. Field order, spacing and accents are fixed.")

    stage(3, "That text is turned into a 32-byte fingerprint with a secret key (HMAC-SHA256)")
    digest = integrity.compute_digest("note", record)
    print("   0x" + digest.hex())
    print("  Without the secret key nobody can recreate this value or guess the text from it.")

    stage(4, "What is sent to the blockchain: the record's type, its id and the fingerprint. No text.")
    print(f"   anchorHash(\"note\", {note_id}, 0x{digest.hex()[:16]}...)")

    stage(5, "The fingerprint is anchored: a transaction is sent and mined into a block")
    result = chain.anchor("note", note_id, digest)
    print(f"   transaction {result['tx_hash'][:22]}...  block {result['block_number']}  version {result['version']}")
    print("  Look at the window running the node: it just printed this transaction.")

    stage(6, "We ask the BLOCKCHAIN (not the database) what it remembers")
    latest = chain.get_latest("note", note_id)
    print(f"   hash      0x{latest['hash'].hex()}")
    print(f"   version   {latest['version']}   deleted: {latest['is_deleted']}")
    print("   identical to our fingerprint:", latest["hash"] == digest)

    stage(7, "Verify: rebuild the fingerprint from the database row today and compare")
    print("   result:", integrity.verify_record(conn, chain, "note", note_id)["status"])

    stage(8, "Someone changes the note directly in the database, bypassing the app")
    conn.execute("UPDATE note SET content = 'Doctor appointment on 20 April at 10:30 AM' WHERE noteid = ?",
                 (note_id,))
    conn.commit()
    tampered = integrity.fetch_record(conn, "note", note_id)
    new_digest = integrity.compute_digest("note", tampered)
    print("   new fingerprint 0x" + new_digest.hex())
    print("   old fingerprint 0x" + digest.hex())
    print("   one character of the text changed (00 became 30), the fingerprint changed completely")
    print("   chain still remembers the OLD one, so verify says:",
          integrity.verify_record(conn, chain, "note", note_id)["status"])

    chain.revert(snapshot)
    print("\n(chain rolled back; nothing from this tour stays on your node)")


if __name__ == "__main__":
    main()
