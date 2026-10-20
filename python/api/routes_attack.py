"""The Attack lab: changes the DATABASE directly, bypassing the app, to simulate an attacker.

Nothing here talks to the chain or goes through the integrity module. That is the point: the
chain is expected to notice. This is demo tooling; the real assistant has no such endpoints.
"""
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import integrity

from . import store
from .deps import require_network
from .schemas import MAX_NOTE_LENGTH
from .stages import BUSY_MESSAGE

router = APIRouter()


class AttackTarget(BaseModel):
    id: int
    coverTracks: bool = False


class AttackEdit(AttackTarget):
    content: str = Field(min_length=1, max_length=MAX_NOTE_LENGTH)


@contextmanager
def _exclusive(ctx):
    """An attack waits for no one: it is refused while a write is running."""
    if not ctx.lock.acquire(blocking=False):
        raise HTTPException(409, BUSY_MESSAGE)
    try:
        yield
    finally:
        ctx.lock.release()


def _require_row(conn, note_id):
    if integrity.fetch_record(conn, "note", note_id) is None:
        raise HTTPException(404, "No such note")


def _overwrite(conn, note_id, content, cover_tracks):
    conn.execute("UPDATE note SET content = ? WHERE noteid = ?", (content, note_id))
    if cover_tracks:        # make the local log agree with the lie
        digest = integrity.compute_digest("note", integrity.fetch_record(conn, "note", note_id)).hex()
        conn.execute("UPDATE integrity_log SET record_hash = ? "
                     "WHERE record_type = 'note' AND record_id = ?", (digest, note_id))
    conn.commit()


def _tracks(cover_tracks):
    return " The local integrity log was rewritten to match." if cover_tracks else ""


@router.post("/{net}/attack/edit")
def silent_edit(request: Request, net: str, body: AttackEdit):
    ctx = require_network(request, net)
    with _exclusive(ctx):
        conn = store.open_db(ctx)
        try:
            _require_row(conn, body.id)
            _overwrite(conn, body.id, body.content, body.coverTracks)
        finally:
            conn.close()
    return {"ok": True, "detail": f"Note {body.id} was changed directly in the database. "
                                  f"The chain was not told.{_tracks(body.coverTracks)}"}


@router.post("/{net}/attack/delete")
def silent_delete(request: Request, net: str, body: AttackTarget):
    ctx = require_network(request, net)
    with _exclusive(ctx):
        conn = store.open_db(ctx)
        try:
            _require_row(conn, body.id)
            conn.execute("DELETE FROM note WHERE noteid = ?", (body.id,))
            if body.coverTracks:
                conn.execute("DELETE FROM integrity_log WHERE record_type = 'note' AND record_id = ?",
                             (body.id,))
            conn.commit()
        finally:
            conn.close()
    tracks = " Its entries in the local integrity log were wiped too." if body.coverTracks else ""
    return {"ok": True, "detail": f"Note {body.id} was removed directly from the database. "
                                  f"The chain was not told.{tracks}"}


@router.post("/{net}/attack/restore")
def restore_earlier_text(request: Request, net: str, body: AttackTarget):
    ctx = require_network(request, net)
    with _exclusive(ctx):
        conn = store.open_db(ctx)
        try:
            _require_row(conn, body.id)
            earlier = store.earlier_text(conn, body.id)
            if earlier is None:
                raise HTTPException(
                    409, "No earlier text is recorded for this note. Edit it through the app once "
                         "first, then restore.")
            _overwrite(conn, body.id, earlier, body.coverTracks)
        finally:
            conn.close()
    return {"ok": True, "detail": f"Note {body.id} was put back to an earlier text that the chain "
                                  f"once held. The chain was not told.{_tracks(body.coverTracks)}"}
