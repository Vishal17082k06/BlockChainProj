from chain import Chain

H1 = bytes(range(32))
H2 = bytes(range(1, 33))
HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # public test key


def test_on_sent_fires_once_before_the_receipt(chain, monkeypatch):
    w3 = chain.connect()[0]
    order = []
    real_wait = w3.eth.wait_for_transaction_receipt

    def spy(*args, **kwargs):
        order.append("receipt")
        return real_wait(*args, **kwargs)

    monkeypatch.setattr(w3.eth, "wait_for_transaction_receipt", spy)
    result = chain.anchor("note", 1, H1, on_sent=lambda tx: order.append(("sent", tx)))
    assert [step if isinstance(step, str) else step[0] for step in order] == ["sent", "receipt"]
    sent_hash = order[0][1]
    assert sent_hash.startswith("0x") and sent_hash == result["tx_hash"]


def test_anchor_reports_gas_and_the_exact_fee(chain):
    w3 = chain.connect()[0]
    result = chain.anchor("note", 1, H1)
    receipt = w3.eth.get_transaction_receipt(result["tx_hash"])
    assert result["gas_used"] > 0
    assert result["gas_used"] == receipt["gasUsed"]
    assert result["fee_wei"] == receipt["gasUsed"] * receipt["effectiveGasPrice"]


def test_mark_deleted_returns_its_transaction_details(chain):
    chain.anchor("note", 1, H1)
    sent = []
    result = chain.mark_deleted("note", 1, on_sent=sent.append)
    assert set(result) == {"tx_hash", "block_number", "gas_used", "fee_wei"}
    assert sent == [result["tx_hash"]]
    assert chain.get_latest("note", 1)["is_deleted"] is True


def test_history_lists_versions_in_order_with_their_transactions(chain):
    first = chain.anchor("note", 1, H1)
    second = chain.anchor("note", 1, H2)
    chain.anchor("note", 2, H1)                       # a different record must not leak in
    history = chain.history("note", 1)
    assert [v["version"] for v in history["versions"]] == [1, 2]
    assert [v["hash"] for v in history["versions"]] == [H1, H2]
    assert [v["tx_hash"] for v in history["versions"]] == [first["tx_hash"], second["tx_hash"]]
    assert [v["block_number"] for v in history["versions"]] == [first["block_number"], second["block_number"]]
    assert all(v["timestamp"] > 0 for v in history["versions"])
    assert history["deleted"] is None


def test_history_includes_the_deletion(chain):
    chain.anchor("note", 1, H1)
    deletion = chain.mark_deleted("note", 1)
    history = chain.history("note", 1)
    assert history["deleted"]["tx_hash"] == deletion["tx_hash"]
    assert history["deleted"]["block_number"] == deletion["block_number"]


def test_history_of_an_unknown_record_is_empty(chain):
    assert chain.history("note", 999) == {"versions": [], "deleted": None}


def test_history_works_when_events_are_read_in_small_chunks(chain, monkeypatch):
    chain.anchor("note", 1, H1)
    chain.anchor("note", 1, H2)
    monkeypatch.setattr(chain, "LOG_CHUNK", 1)
    assert [v["version"] for v in chain.history("note", 1)["versions"]] == [1, 2]


def test_status_reports_the_chain_the_wallet_and_the_owner(chain):
    w3 = chain.connect()[0]
    before = chain.status()
    assert before["chain_id"] == 31337
    assert before["wallet"] == w3.eth.accounts[0]
    assert before["owner"] == before["wallet"]
    assert isinstance(before["balance_wei"], int) and before["balance_wei"] > 0
    chain.anchor("note", 1, H1)
    assert chain.status()["block_number"] > before["block_number"]


def test_status_uses_the_signing_key_address_when_there_is_one(_live_chain):
    # Key #1 belongs to the dev node's SECOND account, so this fails if the key is ignored.
    signer = Chain(private_key=HARDHAT_KEY_1)
    assert signer.status()["wallet"] == _live_chain.connect()[0].eth.accounts[1]
