from fastapi import APIRouter, HTTPException, Request

import integrity
import notes

from . import store
from .deps import require_network
from .schemas import NoteIn
from .stages import stream_write

router = APIRouter()
DEMO_INTERACTION_ID = 1          # the demo has no conversations; every note belongs to interaction 1


def _require_note(ctx, note_id):
    conn = store.open_db(ctx)
    try:
        row = integrity.fetch_record(conn, "note", note_id)
    finally:
        conn.close()
    if row is None:
        raise HTTPException(404, "No such note")


@router.post("/{net}/notes")
def create_note(request: Request, net: str, body: NoteIn):
    ctx = require_network(request, net)

    def work(conn, on_stage):
        result = notes.create_note(conn, ctx.chain, DEMO_INTERACTION_ID, body.content,
                                   on_stage=on_stage)
        store.remember_version(conn, result["noteid"], 1, body.content)
        return result

    return stream_write(ctx, work)


@router.put("/{net}/notes/{note_id}")
def edit_note(request: Request, net: str, note_id: int, body: NoteIn):
    ctx = require_network(request, net)
    _require_note(ctx, note_id)

    def work(conn, on_stage):
        result = notes.update_note(conn, ctx.chain, note_id, body.content, on_stage=on_stage)
        store.remember_version(conn, note_id, result["version"], body.content)
        return {"noteid": note_id}

    return stream_write(ctx, work)


@router.delete("/{net}/notes/{note_id}")
def delete_note(request: Request, net: str, note_id: int):
    ctx = require_network(request, net)
    _require_note(ctx, note_id)

    def work(conn, on_stage):
        notes.delete_note(conn, ctx.chain, note_id, on_stage=on_stage)
        return {"noteid": note_id}

    return stream_write(ctx, work)
