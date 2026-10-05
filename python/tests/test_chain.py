import pytest
from web3.exceptions import ContractLogicError

from chain import Chain, ChainUnavailable

H1 = bytes(range(32))
H2 = bytes(range(1, 33))


def test_anchor_then_get_latest(chain):
    result = chain.anchor("note", 1, H1)
    assert result["version"] == 1
    assert result["tx_hash"].startswith("0x")
    assert isinstance(result["block_number"], int)

    latest = chain.get_latest("note", 1)
    assert latest["hash"] == H1
    assert latest["version"] == 1
    assert latest["timestamp"] > 0
    assert latest["is_deleted"] is False


def test_reanchor_creates_version_two(chain):
    chain.anchor("note", 1, H1)
    assert chain.anchor("note", 1, H2)["version"] == 2
    assert chain.get_latest("note", 1)["hash"] == H2


def test_unknown_record_has_version_zero(chain):
    assert chain.get_latest("note", 999)["version"] == 0


def test_mark_deleted_sets_flag_and_blocks_anchoring(chain):
    chain.anchor("note", 1, H1)
    chain.mark_deleted("note", 1)
    assert chain.get_latest("note", 1)["is_deleted"] is True
    with pytest.raises(ContractLogicError):
        chain.anchor("note", 1, H2)


def test_anchored_records_comes_from_event_logs(chain):
    chain.anchor("note", 1, H1)
    chain.anchor("note", 2, H1)
    chain.anchor("note", 1, H2)
    assert chain.anchored_records() == {("note", 1), ("note", 2)}


def test_snapshot_revert_restores_state(chain):
    snap = chain.snapshot()
    chain.anchor("note", 5, H1)
    chain.revert(snap)
    assert chain.get_latest("note", 5)["version"] == 0


def test_connection_lost_after_connecting_becomes_chain_unavailable(chain):
    # The node was reachable when we connected, then dies mid-session.
    def node_died(w3, contract):
        raise ConnectionError("node died")

    with pytest.raises(ChainUnavailable):
        chain._run(node_died)
    # The cached connection is dropped, so the next call reconnects cleanly.
    assert chain.get_latest("note", 1)["version"] == 0


def test_unreachable_node_raises_chain_unavailable(dead_chain):
    with pytest.raises(ChainUnavailable):
        dead_chain.get_latest("note", 1)
    with pytest.raises(ChainUnavailable):
        dead_chain.anchor("note", 1, H1)
