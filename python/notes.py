import logging

import integrity
from integrity import report_stage, tx_sent_reporter

log = logging.getLogger(__name__)


class IntegrityRefused(Exception):
    """An update was refused because the record's integrity could not be confirmed."""


def create_note(conn, chain, interaction_id, content, on_stage=None):
    cur = conn.execute("INSERT INTO note (interactionid, content) VALUES (?, ?)",
                       (interaction_id, content))
    conn.commit()
    note_id = cur.lastrowid
    report_stage(on_stage, "saved", {"note_id": note_id})
    try:                               # fail-open: anchoring must never block a save
        integrity.anchor_record(conn, chain, "note", note_id, on_stage=on_stage)
        anchored = True
    except Exception as exc:
        log.warning("Anchoring failed for note %s: %s", note_id, exc)
        report_stage(on_stage, "anchor_failed", {"error": exc})
        anchored = False
    return {"noteid": note_id, "anchored": anchored}


def update_note(conn, chain, note_id, content, on_stage=None):
    # Verify-before-update guard (PDF 7.6), fail-closed.
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status not in ("VERIFIED", "NOT_ANCHORED"):
        raise IntegrityRefused(f"Update refused: record status is {status}")
    conn.execute("UPDATE note SET content = ? WHERE noteid = ?", (content, note_id))
    conn.commit()
    result = integrity.anchor_record(conn, chain, "note", note_id, on_stage=on_stage)
    return {"noteid": note_id, "version": result["version"]}


def delete_note(conn, chain, note_id, on_stage=None):
    status = integrity.verify_record(conn, chain, "note", note_id)["status"]
    if status != "NOT_ANCHORED":
        # chain first; raises ChainUnavailable if down
        result = chain.mark_deleted("note", note_id, on_sent=tx_sent_reporter(on_stage))
        report_stage(on_stage, "mined", {
            "block": result["block_number"], "gas_used": result["gas_used"],
            "fee_wei": result["fee_wei"]})
    conn.execute("DELETE FROM note WHERE noteid = ?", (note_id,))
    conn.commit()
    report_stage(on_stage, "removed", {})
