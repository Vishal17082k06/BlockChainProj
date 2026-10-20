import re
import threading

import pytest
from fastapi.testclient import TestClient

import notes
from api import store
from api.app import create_app
from chain import ChainUnavailable, TransactionFailed, WrongNetwork
from tests.api_support import events, make_registry, stages


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


def record(client, note_id):
    return next(r for r in client.get("/api/local/records").json()["records"] if r["id"] == note_id)


def create(client, text="Doctor at 10:00"):
    response = client.post("/api/local/notes", json={"content": text})
    return response, events(response)


def test_create_streams_the_real_stages_in_order(client, ctx):
    response, evs = create(client)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert [e["stage"] for e in evs] == ["saved", "fingerprint", "sent", "mined", "done"]
    by_stage = {e["stage"]: e for e in evs}
    note_id = by_stage["saved"]["noteId"]
    assert re.fullmatch(r"[0-9a-f]{64}", by_stage["fingerprint"]["hash"])
    assert re.fullmatch(r"0x[0-9a-f]{64}", by_stage["sent"]["txHash"])
    assert by_stage["sent"]["explorerUrl"] is None                       # local: no explorer
    mined = by_stage["mined"]
    assert isinstance(mined["block"], int) and mined["gasUsed"] > 0 and mined["version"] == 1
    assert re.fullmatch(r"\d+", mined["feeWei"]) and re.fullmatch(r"\d+\.\d{9}", mined["feeEth"])
    assert by_stage["done"]["noteId"] == note_id
    assert record(client, note_id)["status"] == "VERIFIED"
    conn = store.open_db(ctx)
    assert store.earlier_text(conn, note_id) is None                      # only one text so far
    conn.close()


def test_every_event_carries_a_non_decreasing_elapsed_time(client):
    _, evs = create(client)
    times = [e["t"] for e in evs]
    assert all(isinstance(t, int) for t in times) and times == sorted(times)


def test_edit_streams_fingerprint_sent_mined_done_and_creates_version_two(client):
    note_id = events(client.post("/api/local/notes", json={"content": "first"}))[0]["noteId"]
    response = client.put(f"/api/local/notes/{note_id}", json={"content": "second"})
    evs = events(response)
    assert [e["stage"] for e in evs] == ["fingerprint", "sent", "mined", "done"]
    assert next(e for e in evs if e["stage"] == "mined")["version"] == 2
    assert record(client, note_id)["status"] == "VERIFIED"
    assert record(client, note_id)["content"] == "second"


def test_edit_of_a_tampered_note_is_refused_and_nothing_is_sent(client, ctx):
    note_id = events(client.post("/api/local/notes", json={"content": "original"}))[0]["noteId"]
    conn = store.open_db(ctx)
    conn.execute("UPDATE note SET content = 'forged' WHERE noteid = ?", (note_id,))
    conn.commit()
    conn.close()
    evs = events(client.put(f"/api/local/notes/{note_id}", json={"content": "legit edit"}))
    assert [e["stage"] for e in evs] == ["failed"]
    assert evs[0]["code"] == "REFUSED"
    assert "TAMPERED" in evs[0]["message"] and "not applied" in evs[0]["message"]
    assert record(client, note_id)["content"] == "forged"                 # not blessed, not changed


def test_delete_streams_sent_mined_removed_done_and_the_record_reads_deleted(client):
    note_id = events(client.post("/api/local/notes", json={"content": "to remove"}))[0]["noteId"]
    evs = events(client.delete(f"/api/local/notes/{note_id}"))
    assert [e["stage"] for e in evs] == ["sent", "mined", "removed", "done"]
    detail = client.get(f"/api/local/records/{note_id}").json()
    assert detail["status"] == "DELETED_AUTHORIZED" and detail["row"] is None


@pytest.mark.parametrize("body", [{"content": ""}, {"content": "   "}, {"content": "x" * 501}, {}])
def test_invalid_content_is_rejected_before_any_stream_starts(client, body):
    assert client.post("/api/local/notes", json=body).status_code == 422


def test_edit_and_delete_of_an_unknown_note_are_404_with_our_message(client):
    # Asserting the message matters: a missing ROUTE would also be a 404.
    for response in (client.put("/api/local/notes/999", json={"content": "x"}),
                     client.delete("/api/local/notes/999")):
        assert response.status_code == 404 and response.json()["detail"] == "No such note"


def test_a_second_write_while_one_is_running_gets_409_and_the_first_still_finishes(chain, tmp_path, monkeypatch):
    registry = make_registry(chain, tmp_path)
    ctx = registry["local"]
    started, gate = threading.Event(), threading.Event()
    real_anchor = chain.anchor

    def slow_anchor(*args, **kwargs):
        started.set()
        gate.wait(15)
        return real_anchor(*args, **kwargs)

    monkeypatch.setattr(chain, "anchor", slow_anchor)
    first = {}
    worker = threading.Thread(target=lambda: first.update(
        r=TestClient(create_app(registry)).post("/api/local/notes", json={"content": "slow one"})))
    worker.start()
    try:
        assert started.wait(15)
        assert ctx.lock.locked()
        second = TestClient(create_app(registry)).post("/api/local/notes", json={"content": "too soon"})
        assert second.status_code == 409 and "still running" in second.json()["detail"]
    finally:
        gate.set()
        worker.join(30)
    assert stages(first["r"])[-1] == "done"
    assert not ctx.lock.locked()


def test_the_chain_going_away_mid_write_keeps_the_note_and_says_so(client, chain, monkeypatch):
    def down(*args, **kwargs):
        raise ChainUnavailable("Blockchain node error: connection lost")

    monkeypatch.setattr(chain, "anchor", down)
    response, evs = create(client, "saved but not anchored")
    assert [e["stage"] for e in evs] == ["saved", "fingerprint", "failed"]
    assert evs[-1]["code"] == "CHAIN_UNAVAILABLE" and "saved" in evs[-1]["message"]
    monkeypatch.undo()
    assert record(client, evs[0]["noteId"])["status"] == "NOT_ANCHORED"


@pytest.mark.parametrize("error, code", [
    (WrongNetwork("Refusing to sign on chain id 1"), "WRONG_NETWORK"),
    (TransactionFailed("0x" + "ab" * 32), "TX_FAILED"),
])
def test_other_chain_failures_get_their_own_codes(client, chain, monkeypatch, error, code):
    def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(chain, "anchor", fail)
    _, evs = create(client)
    assert evs[-1]["stage"] == "failed" and evs[-1]["code"] == code


def test_an_unexpected_error_is_reported_without_leaking_its_details(client, chain, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("secret-internal-detail-12345")

    monkeypatch.setattr(chain, "anchor", boom)
    _, evs = create(client)
    assert evs[-1]["code"] == "INTERNAL"
    assert "secret-internal-detail" not in evs[-1]["message"]


def test_a_wallet_below_the_balance_floor_is_refused_before_anything_happens(chain, tmp_path):
    registry = make_registry(chain, tmp_path, balance_floor_wei=10**30)       # far more than the wallet has
    client = TestClient(create_app(registry))
    block_before = chain.status()["block_number"]
    evs = events(client.post("/api/local/notes", json={"content": "should not be sent"}))
    assert [e["stage"] for e in evs] == ["failed"] and evs[0]["code"] == "LOW_BALANCE"
    assert "faucet" in evs[0]["message"]
    assert chain.status()["block_number"] == block_before                    # nothing was sent
    assert client.get("/api/local/records").json()["records"] == []          # and nothing was saved


def test_the_lock_is_released_after_every_outcome(client, ctx, chain, monkeypatch):
    create(client)
    assert not ctx.lock.locked()
    note_id = record(client, client.get("/api/local/records").json()["records"][0]["id"])["id"]
    conn = store.open_db(ctx)
    conn.execute("UPDATE note SET content = 'forged' WHERE noteid = ?", (note_id,))
    conn.commit()
    conn.close()
    client.put(f"/api/local/notes/{note_id}", json={"content": "refused"})      # a refusal
    assert not ctx.lock.locked()
    monkeypatch.setattr(chain, "anchor", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    create(client, "an unexpected failure")
    assert not ctx.lock.locked()
    monkeypatch.undo()
    assert stages(client.post("/api/local/notes", json={"content": "works again"}))[-1] == "done"


def test_edits_and_creates_remember_each_text_for_the_attack_lab(client, ctx):
    note_id = events(client.post("/api/local/notes", json={"content": "original text"}))[0]["noteId"]
    client.put(f"/api/local/notes/{note_id}", json={"content": "edited text"})
    conn = store.open_db(ctx)
    assert store.earlier_text(conn, note_id) == "original text"
    conn.close()


def test_the_sepolia_context_that_is_not_ready_refuses_writes_with_its_reason(client):
    response = client.post("/api/sepolia/notes", json={"content": "x"})
    assert response.status_code == 503 and "not configured" in response.json()["detail"]
