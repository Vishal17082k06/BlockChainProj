"""Command-line demo of the full story (PDF 9.3).

Requires: `npx hardhat node` running and the contract deployed.
Run (from python/):  .venv/Scripts/python.exe demo.py
The chain is rolled back at the end so the demo can be run again.
"""
import sys

import db
import integrity
import notes
from chain import Chain, ChainUnavailable


def show(conn, chain, note_id, label):
    r = integrity.verify_record(conn, chain, "note", note_id)
    print(f"  {label:<48} -> {r['status']}")


def sql(conn, statement, params=()):
    conn.execute(statement, params)
    conn.commit()


def main(keep=False):
    chain = Chain()
    try:
        chain.connect()
    except ChainUnavailable as exc:
        sys.exit(f"Cannot run demo: {exc}")
    snapshot = chain.snapshot()
    conn = db.connect(":memory:")

    print("1. Create three notes. Each is saved in the database and its hash anchored on-chain.")
    a = notes.create_note(conn, chain, 1, "Doctor appointment on 20 April at 10:00 AM")
    b = notes.create_note(conn, chain, 2, "Call Anna about the birthday party")
    c = notes.create_note(conn, chain, 3, "Buy milk and bread")
    print(f"  created notes {a['noteid']}, {b['noteid']}, {c['noteid']}  (anchored: "
          f"{a['anchored']}, {b['anchored']}, {c['anchored']})")
    tx = conn.execute("SELECT tx_hash, block_number FROM integrity_log LIMIT 1").fetchone()
    print(f"  first proof: tx {tx['tx_hash'][:18]}... in block {tx['block_number']}")

    print("\n2. Verify the untouched note.")
    show(conn, chain, a["noteid"], "note 1, untouched")

    print("\n3. Someone edits note 1 directly in the database, bypassing the app.")
    sql(conn, "UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (a["noteid"],))
    show(conn, chain, a["noteid"], "note 1 after silent edit")

    print("\n4. The app refuses to edit the tampered note (it would bless the forgery).")
    try:
        notes.update_note(conn, chain, a["noteid"], "legit edit")
    except notes.IntegrityRefused as exc:
        print(f"  refused: {exc}")

    print("\n5. A legitimate edit through the app on a clean note creates version 2.")
    r = notes.update_note(conn, chain, b["noteid"], "Call Anna about the party on Saturday")
    print(f"  note 2 re-anchored as version {r['version']}")
    show(conn, chain, b["noteid"], "note 2 after legitimate edit")

    print("\n6. Rollback attack: restore note 2's ORIGINAL text behind the app's back.")
    sql(conn, "UPDATE note SET content = 'Call Anna about the birthday party' WHERE noteid = ?",
        (b["noteid"],))
    show(conn, chain, b["noteid"], "note 2 restored to its version-1 text")

    print("\n7. Someone silently deletes note 3, and also wipes the local integrity log.")
    sql(conn, "DELETE FROM note WHERE noteid = ?", (c["noteid"],))
    sql(conn, "DELETE FROM integrity_log")
    show(conn, chain, c["noteid"], "note 3 after silent delete")

    print("\n8. Check everything at once (ids come from the chain's event logs).")
    report = integrity.verify_all(conn, chain, "note")
    print(f"  summary: {report['summary']}")

    print("\n9. Authorised delete through the app on a fresh note.")
    d = notes.create_note(conn, chain, 4, "Temporary note")
    notes.delete_note(conn, chain, d["noteid"])
    show(conn, chain, d["noteid"], "note 4 after authorised delete")

    if not keep:
        chain.revert(snapshot)
        print("\n(chain rolled back; run with --keep to leave the anchors in place)")


if __name__ == "__main__":
    main(keep="--keep" in sys.argv)
