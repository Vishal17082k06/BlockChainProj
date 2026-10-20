import re

import pytest

import integrity
import notes
from chain import ChainUnavailable


class Recorder:
    """Collects (stage, payload) pairs reported through on_stage."""

    def __init__(self):
        self.events = []

    def __call__(self, stage, payload):
        self.events.append((stage, payload))

    @property
    def names(self):
        return [name for name, _ in self.events]

    def payload(self, name):
        return next(p for n, p in self.events if n == name)


def test_create_reports_saved_fingerprint_sent_mined_in_order(conn, chain):
    rec = Recorder()
    result = notes.create_note(conn, chain, 1, "Doctor at 10:00", on_stage=rec)
    assert rec.names == ["saved", "fingerprint", "sent", "mined"]
    assert rec.payload("saved")["note_id"] == result["noteid"]
    row = integrity.fetch_record(conn, "note", result["noteid"])
    assert rec.payload("fingerprint")["hash"] == integrity.compute_digest("note", row).hex()
    assert re.fullmatch(r"0x[0-9a-f]{64}", rec.payload("sent")["tx_hash"])
    mined = rec.payload("mined")
    assert mined["version"] == 1 and mined["gas_used"] > 0 and mined["fee_wei"] > 0
    assert isinstance(mined["block"], int)
    # the hash reported while the transaction was in flight is the one now on the chain
    history = chain.history("note", result["noteid"])
    assert history["versions"][0]["tx_hash"] == rec.payload("sent")["tx_hash"]


def test_update_reports_fingerprint_sent_mined_and_version_two(conn, chain):
    nid = notes.create_note(conn, chain, 1, "first")["noteid"]
    rec = Recorder()
    notes.update_note(conn, chain, nid, "second", on_stage=rec)
    assert rec.names == ["fingerprint", "sent", "mined"]
    assert rec.payload("mined")["version"] == 2


def test_delete_reports_sent_mined_removed(conn, chain):
    nid = notes.create_note(conn, chain, 1, "to be removed")["noteid"]
    rec = Recorder()
    notes.delete_note(conn, chain, nid, on_stage=rec)
    assert rec.names == ["sent", "mined", "removed"]
    assert rec.payload("mined")["gas_used"] > 0
    assert rec.payload("mined").get("version") is None


def test_deleting_a_note_that_was_never_anchored_touches_no_chain_stage(conn, chain, dead_chain):
    nid = notes.create_note(conn, dead_chain, 1, "never anchored")["noteid"]
    rec = Recorder()
    notes.delete_note(conn, chain, nid, on_stage=rec)
    assert rec.names == ["removed"]


def test_a_refused_update_reports_no_chain_stage(conn, chain):
    nid = notes.create_note(conn, chain, 1, "original")["noteid"]
    conn.execute("UPDATE note SET content = 'forged' WHERE noteid = ?", (nid,))
    conn.commit()
    rec = Recorder()
    with pytest.raises(notes.IntegrityRefused):
        notes.update_note(conn, chain, nid, "legit", on_stage=rec)
    assert rec.names == []


def test_a_failed_anchor_on_create_is_reported_with_its_cause(conn, dead_chain):
    rec = Recorder()
    result = notes.create_note(conn, dead_chain, 1, "saved but not anchored", on_stage=rec)
    assert result["anchored"] is False
    # The fingerprint WAS computed before the send was attempted, so it is reported truthfully.
    assert rec.names == ["saved", "fingerprint", "anchor_failed"]
    assert isinstance(rec.payload("anchor_failed")["error"], ChainUnavailable)
