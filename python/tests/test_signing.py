import json

import pytest
from eth_utils import keccak
from web3.exceptions import ContractLogicError

import chain as chain_module
import settings
from chain import Chain, WrongNetwork
from merkle_chain import MerkleChain

# Publicly known Hardhat test keys (printed by `npx hardhat node`). Worthless.
HARDHAT_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"   # owner
HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # not owner
H1 = bytes(range(32))
H2 = bytes(range(1, 33))


@pytest.fixture
def signing_chain(_live_chain):
    c = Chain(private_key=HARDHAT_KEY_0)
    snap = c.snapshot()
    yield c
    c.revert(snap)


def test_signed_anchor_and_delete_work(signing_chain):
    result = signing_chain.anchor("note", 1, H1)
    assert result["version"] == 1 and result["tx_hash"].startswith("0x")
    assert signing_chain.get_latest("note", 1)["hash"] == H1
    signing_chain.mark_deleted("note", 1)
    assert signing_chain.get_latest("note", 1)["is_deleted"] is True


def test_signed_transaction_from_a_non_owner_is_rejected(_live_chain):
    c = Chain(private_key=HARDHAT_KEY_1)
    snap = c.snapshot()
    try:
        with pytest.raises(ContractLogicError):
            c.anchor("note", 1, H1)
    finally:
        c.revert(snap)


def test_signing_is_refused_on_an_unapproved_network(_live_chain, monkeypatch):
    monkeypatch.setattr(chain_module, "ALLOWED_SIGNING_CHAIN_IDS", frozenset({1}))
    with pytest.raises(WrongNetwork):
        Chain(private_key=HARDHAT_KEY_0).connect()


def test_mainnet_is_never_in_the_approved_set():
    assert 1 not in chain_module.ALLOWED_SIGNING_CHAIN_IDS


def test_the_dev_node_path_still_works_without_a_key(chain):
    assert chain.anchor("note", 2, H1)["version"] == 1


def test_signed_merkle_root_works(_live_merkle_chain):
    c = MerkleChain(private_key=HARDHAT_KEY_0)
    snap = c.snapshot()
    try:
        assert c.anchor_root(keccak(b"root"), 3)["batch_id"] == 0
    finally:
        c.revert(snap)


def test_event_queries_work_in_small_chunks(chain, monkeypatch):
    chain.anchor("note", 1, H1)
    chain.anchor("note", 2, H1)
    chain.anchor("note", 3, H2)
    monkeypatch.setattr(chain, "LOG_CHUNK", 1)         # force several requests
    assert chain.anchored_records() == {("note", 1), ("note", 2), ("note", 3)}


def test_event_queries_start_at_the_deployment_block(chain, tmp_path):
    chain.anchor("note", 1, H1)
    dep = json.loads(settings.deployment_file().read_text())
    dep["deploymentBlock"] = chain.connect()[0].eth.block_number + 1   # after every anchor
    f = tmp_path / "dep.json"
    f.write_text(json.dumps(dep))
    later = Chain(deployment_file=f)
    assert later.anchored_records() == set()           # nothing at or after that block
