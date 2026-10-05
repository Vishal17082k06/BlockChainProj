import logging

import integrity

log = logging.getLogger(__name__)


class IntegrityRefused(Exception):
    """An update was refused because the record's integrity could not be confirmed."""


def create_note(conn, chain, interaction_id, content):
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                       (interaction_id, content))
    conn.commit()
    note_id = cur.lastrowid
    try:                               # fail-open: anchoring must never block a save
        integrity.anchor_record(conn, chain, "note", note_id)
        anchored = True
    except Exception as exc:
        log.warning("Anchoring failed for note %s: %s", note_id, exc)
        anchored = False
    return {"noteid": note_id, "anchored": anchored}


def update_note(conn, chain, note_id, content):
    # Verify-before-update guard (PDF 7.6), fail-closed.
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status not in ("VERIFIED", "NOT_ANCHORED"):
        raise IntegrityRefused(f"Update refused: record status is {status}")
    conn.execute("UPDATE note SET content = ? WHERE noteid = ?", (content, note_id))
    conn.commit()
    result = integrity.anchor_record(conn, chain, "note", note_id)
    return {"noteid": note_id, "version": result["version"]}


def delete_note(conn, chain, note_id):
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status != "NOT_ANCHORED":
        chain.mark_deleted("note", note_id)      # chain first; raises ChainUnavailable if down
    conn.execute("DELETE FROM note WHERE noteid = ?", (note_id,))
    conn.commit()
