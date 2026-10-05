import pytest

import integrity
import notes
from chain import ChainUnavailable


def make_note(conn, chain, content="Doctor appointment at 10:00 AM", interaction_id=1):
    return notes.create_note(conn, chain, interaction_id, content)["noteid"]


def status(conn, chain, note_id):
    return integrity.verify_record(conn, chain, "note", note_id)["status"]


def test_create_anchors_and_verifies(conn, chain):
    result = notes.create_note(conn, chain, 1, "hello")
    assert result["anchored"] is True
    assert status(conn, chain, result["noteid"]) == "VERIFIED"
    rows = conn.execute("SELECT version, record_hash FROM integrity_log").fetchall()
    assert len(rows) == 1 and rows[0]["version"] == 1 and len(rows[0]["record_hash"]) == 64


def test_never_anchored_record_is_not_anchored(conn, chain):
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (1, 'raw')")
    conn.commit()
    assert status(conn, chain, cur.lastrowid) == "NOT_ANCHORED"


def test_silent_edit_is_tampered(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'Appointment cancelled' WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"


def test_editing_an_unprotected_column_is_not_detected(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET created_at = '1999-01-01' WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "VERIFIED"   # documents the limitation: only listed fields


def test_silent_delete_is_missing_from_db(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("DELETE FROM note WHERE noteid = ?", (nid,))
    conn.commit()
    assert status(conn, chain, nid) == "MISSING_FROM_DB"


def test_authorised_delete(conn, chain):
    nid = make_note(conn, chain)
    notes.delete_note(conn, chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 0
    assert status(conn, chain, nid) == "DELETED_AUTHORIZED"


def test_deleted_on_chain_but_row_still_present_is_inconsistent(conn, chain):
    nid = make_note(conn, chain)
    chain.mark_deleted("note", nid)
    assert status(conn, chain, nid) == "INCONSISTENT"


def test_legitimate_edit_creates_version_two(conn, chain):
    nid = make_note(conn, chain)
    result = notes.update_note(conn, chain, nid, "Appointment moved to 11:00 AM")
    assert result["version"] == 2
    assert status(conn, chain, nid) == "VERIFIED"


def test_rollback_attack_is_detected(conn, chain):
    nid = make_note(conn, chain, content="original")
    notes.update_note(conn, chain, nid, "edited")
    conn.execute("UPDATE note SET content = 'original' WHERE noteid = ?", (nid,))   # restore v1
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"      # only the latest version is valid


def test_update_is_refused_on_a_tampered_record(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'tampered' WHERE noteid = ?", (nid,))
    conn.commit()
    with pytest.raises(notes.IntegrityRefused):
        notes.update_note(conn, chain, nid, "legit edit")
    content = conn.execute("SELECT content FROM note WHERE noteid = ?", (nid,)).fetchone()[0]
    assert content == "tampered"                       # not "blessed" with a new anchor
    assert chain.get_latest("note", nid)["version"] == 1


def test_attacker_who_also_rewrites_integrity_log_is_still_caught(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("UPDATE note SET content = 'tampered' WHERE noteid = ?", (nid,))
    forged = integrity.compute_digest("note", integrity.fetch_record(conn, "note", nid)).hex()
    conn.execute("UPDATE integrity_log SET record_hash = ?", (forged,))
    conn.commit()
    assert status(conn, chain, nid) == "TAMPERED"      # the chain, not the log, is the authority


def test_verify_all_summary(conn, chain):
    ids = [make_note(conn, chain, content=f"note {i}", interaction_id=i) for i in range(3)]
    conn.execute("UPDATE note SET content = 'x' WHERE noteid = ?", (ids[1],))
    conn.commit()
    report = integrity.verify_all(conn, chain, "note")
    assert report["summary"] == {"VERIFIED": 2, "TAMPERED": 1}


def test_verify_all_catches_row_deleted_together_with_its_log_entries(conn, chain):
    nid = make_note(conn, chain)
    conn.execute("DELETE FROM note WHERE noteid = ?", (nid,))
    conn.execute("DELETE FROM integrity_log")           # attacker cleans up the local log too
    conn.commit()
    report = integrity.verify_all(conn, chain, "note")
    assert report["summary"] == {"MISSING_FROM_DB": 1}  # id came from chain events


def test_unreachable_chain_is_unavailable_never_verified(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    assert status(conn, dead_chain, nid) == "UNAVAILABLE"


def test_create_still_saves_when_chain_is_down(conn, chain, dead_chain):
    result = notes.create_note(conn, dead_chain, 1, "saved anyway")
    assert result["anchored"] is False
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 1
    assert status(conn, chain, result["noteid"]) == "NOT_ANCHORED"


def test_update_is_refused_when_chain_is_down(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    with pytest.raises(notes.IntegrityRefused):
        notes.update_note(conn, dead_chain, nid, "should not happen")
    content = conn.execute("SELECT content FROM note WHERE noteid = ?", (nid,)).fetchone()[0]
    assert content == "Doctor appointment at 10:00 AM"


def test_deleting_a_never_anchored_note_works(conn, chain, dead_chain):
    nid = notes.create_note(conn, dead_chain, 1, "never anchored")["noteid"]
    notes.delete_note(conn, chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 0


def test_delete_is_refused_when_chain_is_down(conn, chain, dead_chain):
    nid = make_note(conn, chain)
    with pytest.raises(ChainUnavailable):
        notes.delete_note(conn, dead_chain, nid)
    assert conn.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 1


def test_unicode_survives_a_database_round_trip(conn, chain):
    nid = make_note(conn, chain, content="café 日本語 ́")
    assert status(conn, chain, nid) == "VERIFIED"


def test_unknown_record_type_is_rejected(conn, chain):
    with pytest.raises(ValueError):
        integrity.verify_record(conn, chain, "users; DROP TABLE note", 1)
