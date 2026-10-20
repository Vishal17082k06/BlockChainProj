import json
import re

import pytest
from fastapi.testclient import TestClient

import notes
from api import store
from api.app import create_app
from api.networks import NetworkContext
from chain import Chain

H = bytes(range(32))
HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # public test key


def make_registry(chain, tmp_path, local_chain=None):
    local = NetworkContext(id="local", label="Local chain", chain=local_chain or chain,
                           db_path=tmp_path / "local.db", explorer_base=None, balance_floor_wei=0)
    sepolia = NetworkContext(id="sepolia", label="Sepolia", chain=None, db_path=tmp_path / "sepolia.db",
                             explorer_base="https://sepolia.etherscan.io", balance_floor_wei=2 * 10**15,
                             setup_reason="Sepolia is not configured: add SEPOLIA_RPC_URL and "
                                          "SEPOLIA_PRIVATE_KEY to python/.env")
    return {"local": local, "sepolia": sepolia}


@pytest.fixture
def ctx_and_client(chain, tmp_path):
    registry = make_registry(chain, tmp_path)
    return registry["local"], TestClient(create_app(registry))


@pytest.fixture
def client(ctx_and_client):
    return ctx_and_client[1]


@pytest.fixture
def db(ctx_and_client):
    conn = store.open_db(ctx_and_client[0])
    yield conn
    conn.close()


def make_note(db, chain, text="Doctor at 10:00", interaction=1):
    return notes.create_note(db, chain, interaction, text)["noteid"]


def test_networks_lists_local_ready_and_sepolia_with_its_reason(client, chain):
    body = client.get("/api/networks").json()
    by_id = {n["id"]: n for n in body}
    local = by_id["local"]
    assert local["ready"] is True and local["reason"] is None
    assert local["chainId"] == 31337 and isinstance(local["blockNumber"], int)
    assert local["contracts"]["integrity"] == chain.address
    assert local["owner"] == local["wallet"]
    assert re.fullmatch(r"\d+\.\d{6}", local["balanceEth"])
    sepolia = by_id["sepolia"]
    assert sepolia["ready"] is False and "not configured" in sepolia["reason"]
    assert sepolia["explorer"] == "https://sepolia.etherscan.io"
    assert sepolia["chainId"] is None


def test_networks_reports_an_unreachable_node_as_not_ready(chain, tmp_path):
    registry = make_registry(chain, tmp_path, local_chain=Chain(rpc_url="http://127.0.0.1:9"))
    local = {n["id"]: n for n in TestClient(create_app(registry)).get("/api/networks").json()}["local"]
    assert local["ready"] is False and "not reachable" in local["reason"]


def test_records_on_an_empty_database(client):
    assert client.get("/api/local/records").json() == {"summary": {}, "records": []}


def test_anchored_notes_are_listed_verified_newest_first(client, db, chain):
    first = make_note(db, chain, "first", 1)
    second = make_note(db, chain, "second", 2)
    body = client.get("/api/local/records").json()
    assert [r["id"] for r in body["records"]] == [second, first]
    assert {r["status"] for r in body["records"]} == {"VERIFIED"}
    assert all(r["version"] == 1 and r["inDatabase"] and r["anchoredAt"] > 0 for r in body["records"])
    assert body["records"][0]["content"] == "second"
    assert body["summary"] == {"VERIFIED": 2}


def test_a_silent_edit_shows_as_tampered(client, db, chain):
    nid = make_note(db, chain)
    db.execute("UPDATE note SET content = 'forged' WHERE noteid = ?", (nid,))
    db.commit()
    body = client.get("/api/local/records").json()
    assert body["records"][0]["status"] == "TAMPERED"
    assert body["summary"] == {"TAMPERED": 1}


def test_a_record_only_the_chain_remembers_is_a_ghost(client, db, chain):
    nid = make_note(db, chain)
    db.execute("DELETE FROM note WHERE noteid = ?", (nid,))
    db.commit()
    record = client.get("/api/local/records").json()["records"][0]
    assert record["id"] == nid and record["status"] == "MISSING_FROM_DB"
    assert record["inDatabase"] is False and record["content"] is None


def test_record_detail_compares_the_two_fingerprints(client, db, chain):
    nid = make_note(db, chain)
    clean = client.get(f"/api/local/records/{nid}").json()
    assert clean["status"] == "VERIFIED"
    assert re.fullmatch(r"[0-9a-f]{64}", clean["fingerprint"]["database"])
    assert clean["fingerprint"]["database"] == clean["fingerprint"]["chain"]
    assert clean["fingerprint"]["matches"] is True
    assert clean["row"] == {"content": "Doctor at 10:00"}
    assert len(clean["versions"]) == 1 and clean["deletion"] is None
    version = clean["versions"][0]
    assert version["version"] == 1 and re.fullmatch(r"0x[0-9a-f]{64}", version["txHash"])
    assert isinstance(version["block"], int) and version["explorerUrl"] is None   # local: no explorer

    db.execute("UPDATE note SET content = 'forged' WHERE noteid = ?", (nid,))
    db.commit()
    tampered = client.get(f"/api/local/records/{nid}").json()
    assert tampered["status"] == "TAMPERED"
    assert tampered["fingerprint"]["matches"] is False
    assert tampered["fingerprint"]["chain"] == clean["fingerprint"]["chain"]      # the chain did not change
    assert tampered["fingerprint"]["database"] != tampered["fingerprint"]["chain"]


def test_record_detail_lists_every_version_and_the_deletion(client, db, chain):
    nid = make_note(db, chain)
    notes.update_note(db, chain, nid, "second text")
    notes.delete_note(db, chain, nid)
    detail = client.get(f"/api/local/records/{nid}").json()
    assert detail["status"] == "DELETED_AUTHORIZED" and detail["row"] is None
    assert [v["version"] for v in detail["versions"]] == [1, 2]
    assert re.fullmatch(r"0x[0-9a-f]{64}", detail["deletion"]["txHash"])


def test_explorer_links_are_built_for_networks_that_have_an_explorer(chain, tmp_path):
    ctx = NetworkContext(id="local", label="Local chain", chain=chain, db_path=tmp_path / "x.db",
                         explorer_base="https://explorer.example", balance_floor_wei=0)
    client = TestClient(create_app({"local": ctx}))
    conn = store.open_db(ctx)
    nid = make_note(conn, chain)
    notes.delete_note(conn, chain, nid)
    conn.close()
    detail = client.get(f"/api/local/records/{nid}").json()
    version = detail["versions"][0]
    assert version["explorerUrl"] == f"https://explorer.example/tx/{version['txHash']}"
    assert detail["deletion"]["explorerUrl"] == f"https://explorer.example/tx/{detail['deletion']['txHash']}"


def test_unknown_record_is_404(client):
    assert client.get("/api/local/records/12345").status_code == 404


def test_verify_all_summary_matches_the_list(client, db, chain):
    ids = [make_note(db, chain, f"n{i}", i) for i in range(3)]
    db.execute("UPDATE note SET content = 'x' WHERE noteid = ?", (ids[1],))
    db.commit()
    result = client.post("/api/local/verify-all").json()
    assert result["summary"] == {"VERIFIED": 2, "TAMPERED": 1}
    assert result["summary"] == client.get("/api/local/records").json()["summary"]
    assert len(result["results"]) == 3


def test_a_new_database_starts_its_ids_after_the_highest_id_on_the_chain(chain, tmp_path):
    chain.anchor("note", 7, H)                         # the chain already knows note 7
    ctx = make_registry(chain, tmp_path)["local"]
    conn = store.open_db(ctx)
    first = notes.create_note(conn, chain, 1, "after the gap")["noteid"]
    assert first == 8
    conn.close()


def test_unknown_network_is_404_and_a_network_that_is_not_ready_is_503(client):
    assert client.get("/api/nowhere/records").status_code == 404
    response = client.get("/api/sepolia/records")
    assert response.status_code == 503 and "not configured" in response.json()["detail"]


def test_no_secret_ever_appears_in_a_response(chain, tmp_path, monkeypatch):
    signer = Chain(private_key=HARDHAT_KEY_1)
    registry = make_registry(chain, tmp_path, local_chain=signer)
    client = TestClient(create_app(registry))
    conn = store.open_db(registry["local"])
    nid = make_note(conn, signer)
    conn.close()
    texts = [client.get("/api/networks").text, client.get("/api/local/records").text,
             client.get(f"/api/local/records/{nid}").text, client.post("/api/local/verify-all").text]
    blob = " ".join(texts).lower()
    assert HARDHAT_KEY_1[2:].lower() not in blob
    assert "test-secret-key-not-for-production" not in blob
