import threading

import pytest
from fastapi.testclient import TestClient

import integrity
from api import store
from api.app import create_app
from tests.api_support import events, make_registry


@pytest.fixture
def ctx_and_client(chain, tmp_path):
    registry = make_registry(chain, tmp_path)
    return registry["local"], TestClient(create_app(registry))


@pytest.fixture
def client(ctx_and_client):
    return ctx_and_client[1]


@pytest.fixture
def ctx(ctx_and_client):
    return ctx_and_client[0]


def new_note(client, text="Doctor at 10:00"):
    return events(client.post("/api/local/notes", json={"content": text}))[0]["noteId"]


def status_of(client, note_id):
    return next(r for r in client.get("/api/local/records").json()["records"] if r["id"] == note_id)


def log_hashes(ctx, note_id):
    conn = store.connect_existing(ctx)
    try:
        return [r[0] for r in conn.execute(
            "SELECT record_hash FROM integrity_log WHERE record_type='note' AND record_id=?", (note_id,))]
    finally:
        conn.close()


def test_a_silent_edit_changes_the_database_and_the_record_reads_tampered(client):
    note_id = new_note(client)
    response = client.post("/api/local/attack/edit", json={"id": note_id, "content": "Appointment cancelled"})
    assert response.status_code == 200 and response.json()["ok"] is True
    assert "chain was not told" in response.json()["detail"]
    record = status_of(client, note_id)
    assert record["content"] == "Appointment cancelled" and record["status"] == "TAMPERED"


def test_a_silent_delete_removes_the_row_and_the_record_reads_missing(client):
    note_id = new_note(client)
    assert client.post("/api/local/attack/delete", json={"id": note_id}).json()["ok"] is True
    record = status_of(client, note_id)
    assert record["status"] == "MISSING_FROM_DB" and record["inDatabase"] is False


def test_restore_with_no_earlier_text_is_refused_with_a_plain_message(client):
    note_id = new_note(client)
    response = client.post("/api/local/attack/restore", json={"id": note_id})
    assert response.status_code == 409 and "Edit it through the app once" in response.json()["detail"]


def test_restoring_an_earlier_text_is_a_rollback_attack_and_it_is_caught(client):
    note_id = new_note(client, "original text")
    client.put(f"/api/local/notes/{note_id}", json={"content": "edited text"})
    assert status_of(client, note_id)["status"] == "VERIFIED"
    assert client.post("/api/local/attack/restore", json={"id": note_id}).json()["ok"] is True
    record = status_of(client, note_id)
    assert record["content"] == "original text"          # it LOOKS like a text the chain once held
    assert record["status"] == "TAMPERED"                # but only the latest version counts


def test_covering_tracks_on_an_edit_forges_the_local_log_and_is_still_caught(client, ctx):
    note_id = new_note(client)
    before = log_hashes(ctx, note_id)
    client.post("/api/local/attack/edit",
                json={"id": note_id, "content": "forged text", "coverTracks": True})
    conn = store.connect_existing(ctx)
    forged = integrity.compute_digest("note", integrity.fetch_record(conn, "note", note_id)).hex()
    conn.close()
    after = log_hashes(ctx, note_id)
    assert after != before and after == [forged]          # the local log now agrees with the lie
    assert status_of(client, note_id)["status"] == "TAMPERED"   # the chain is the authority


def test_without_covering_tracks_the_local_log_is_left_alone(client, ctx):
    note_id = new_note(client)
    before = log_hashes(ctx, note_id)
    client.post("/api/local/attack/edit", json={"id": note_id, "content": "forged text"})
    assert status_of(client, note_id)["content"] == "forged text"      # the attack DID happen
    assert log_hashes(ctx, note_id) == before                           # but the log was not touched


def test_covering_tracks_on_a_delete_wipes_the_log_and_the_chain_still_remembers(client, ctx):
    note_id = new_note(client)
    other = new_note(client, "another note")
    client.post("/api/local/attack/delete", json={"id": note_id, "coverTracks": True})
    assert log_hashes(ctx, note_id) == []
    assert len(log_hashes(ctx, other)) == 1                # only the target's log entries were touched
    assert status_of(client, note_id)["status"] == "MISSING_FROM_DB"


def test_attacks_on_an_unknown_note_are_404_with_our_message(client):
    for path, body in (("edit", {"id": 999, "content": "x"}), ("delete", {"id": 999}),
                       ("restore", {"id": 999})):
        response = client.post(f"/api/local/attack/{path}", json=body)
        assert response.status_code == 404 and response.json()["detail"] == "No such note"


def test_an_attack_never_touches_the_chain(client, chain):
    note_id = new_note(client, "first")
    client.put(f"/api/local/notes/{note_id}", json={"content": "second"})
    block = chain.status()["block_number"]
    responses = [
        client.post("/api/local/attack/edit", json={"id": note_id, "content": "x", "coverTracks": True}),
        client.post("/api/local/attack/restore", json={"id": note_id}),
        client.post("/api/local/attack/delete", json={"id": note_id, "coverTracks": True}),
    ]
    assert [r.status_code for r in responses] == [200, 200, 200]        # all three really ran
    assert chain.status()["block_number"] == block                      # and none sent a transaction


def test_empty_attack_text_is_rejected(client):
    note_id = new_note(client)
    assert client.post("/api/local/attack/edit", json={"id": note_id, "content": ""}).status_code == 422


def test_an_attack_during_a_running_write_is_refused(chain, tmp_path, monkeypatch):
    registry = make_registry(chain, tmp_path)
    ctx = registry["local"]
    first = TestClient(create_app(registry))
    note_id = new_note(first)
    started, gate = threading.Event(), threading.Event()
    real_anchor = chain.anchor

    def slow(*args, **kwargs):
        started.set()
        gate.wait(15)
        return real_anchor(*args, **kwargs)

    monkeypatch.setattr(chain, "anchor", slow)
    worker = threading.Thread(target=lambda: TestClient(create_app(registry)).post(
        "/api/local/notes", json={"content": "slow"}))
    worker.start()
    try:
        assert started.wait(15)
        refused = TestClient(create_app(registry)).post(
            "/api/local/attack/edit", json={"id": note_id, "content": "x"})
        assert refused.status_code == 409
    finally:
        gate.set()
        worker.join(30)
    assert not ctx.lock.locked()
