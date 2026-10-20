"""Over a REAL HTTP server: stages must reach the client as they happen, not all at the end."""
import json
import queue
import socket
import threading

import pytest
import requests
import uvicorn

from api.app import create_app
from tests.api_support import make_registry


@pytest.fixture
def live_server(chain, tmp_path):
    registry = make_registry(chain, tmp_path)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(create_app(registry), host="127.0.0.1", port=port,
                                           log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        threading.Event().wait(0.05)
    assert server.started, "the test server did not start"
    yield f"http://127.0.0.1:{port}", registry["local"]
    server.should_exit = True
    thread.join(10)


def test_the_transaction_hash_arrives_while_the_transaction_is_still_in_flight(live_server, chain, monkeypatch):
    base, ctx = live_server
    w3 = chain.connect()[0]
    real_wait = w3.eth.wait_for_transaction_receipt
    in_flight = threading.Event()
    release = threading.Event()

    def held(*args, **kwargs):
        in_flight.set()
        release.wait(20)                       # the "network" is busy: the receipt is not available yet
        return real_wait(*args, **kwargs)

    monkeypatch.setattr(w3.eth, "wait_for_transaction_receipt", held)

    received = queue.Queue()

    def reader():
        with requests.post(f"{base}/api/local/notes", json={"content": "live stream"}, stream=True,
                           timeout=30) as response:
            for line in response.iter_lines():
                if line:
                    received.put(json.loads(line))
        received.put(None)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    try:
        assert in_flight.wait(15), "the transaction was never sent"
        early = [received.get(timeout=10)["stage"] for _ in range(3)]
        assert early == ["saved", "fingerprint", "sent"]           # all arrived BEFORE the receipt
        assert received.empty()                                    # and nothing else yet
        assert ctx.lock.locked()                                   # the write is still running
    finally:
        release.set()
    rest = []
    while (item := received.get(timeout=20)) is not None:
        rest.append(item["stage"])
    assert rest == ["mined", "done"]
    thread.join(10)
    assert not ctx.lock.locked()


def test_the_networks_endpoint_works_over_real_http(live_server):
    base, _ = live_server
    body = requests.get(f"{base}/api/networks", timeout=20).json()
    assert [n["id"] for n in body] == ["local", "sepolia"]
    assert body[0]["ready"] is True
