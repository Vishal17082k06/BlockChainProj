import json

import pytest

import check_deployment as cd
import register_deployment as rd


def deploy_fresh(w3, name):
    """Deploy a fresh copy of one of OUR contracts from the dev node's first account."""
    artifact = cd.load_artifact(name)
    contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    tx = contract.constructor().transact({"from": w3.eth.accounts[0]})
    receipt = w3.eth.wait_for_transaction_receipt(tx)
    return receipt["contractAddress"], w3.to_hex(tx), receipt["blockNumber"]


def test_registers_a_correct_deployment_and_writes_the_file(chain, tmp_path):
    w3 = chain.connect()[0]
    address, tx, block = deploy_fresh(w3, "IntegrityRegistry")
    out = rd.register("IntegrityRegistry", address, tx, network="local", w3=w3, out_dir=tmp_path)
    data = json.loads(out.read_text())
    assert out.name == "deployment.json"
    assert data["address"] == address
    assert data["deploymentBlock"] == block
    assert data["abi"] == cd.load_artifact("IntegrityRegistry")["abi"]


def test_merkle_registry_uses_its_own_file_name(chain, tmp_path):
    w3 = chain.connect()[0]
    address, tx, _ = deploy_fresh(w3, "MerkleRegistry")
    out = rd.register("MerkleRegistry", address, tx, network="local", w3=w3, out_dir=tmp_path)
    assert out.name == "merkle_deployment.json"


def test_refuses_code_that_is_not_our_contract(chain, tmp_path):
    w3 = chain.connect()[0]
    address, tx, _ = deploy_fresh(w3, "MerkleRegistry")
    with pytest.raises(rd.RegistrationError, match="not our compiled"):
        rd.register("IntegrityRegistry", address, tx, network="local", w3=w3, out_dir=tmp_path)
    assert not list(tmp_path.iterdir())               # nothing written


def test_refuses_a_transaction_that_did_not_create_that_address(chain, tmp_path):
    w3 = chain.connect()[0]
    address, _, _ = deploy_fresh(w3, "IntegrityRegistry")
    _, other_tx, _ = deploy_fresh(w3, "IntegrityRegistry")
    with pytest.raises(rd.RegistrationError, match="did not create"):
        rd.register("IntegrityRegistry", address, other_tx, network="local", w3=w3, out_dir=tmp_path)
    assert not list(tmp_path.iterdir())


def test_a_failed_transaction_is_reported_as_failed(chain, tmp_path, monkeypatch):
    # The Hardhat dev node refuses to record a doomed transaction, so we cannot create a real
    # failed deployment locally. Instead hand the tool a receipt that is perfect EXCEPT that
    # its status says "failed", which isolates exactly this check.
    w3 = chain.connect()[0]
    address, tx, block = deploy_fresh(w3, "IntegrityRegistry")
    monkeypatch.setattr(w3.eth, "get_transaction_receipt",
                        lambda h: {"status": 0, "contractAddress": address, "blockNumber": block})
    with pytest.raises(rd.RegistrationError, match="failed on the chain"):
        rd.register("IntegrityRegistry", address, tx, network="local", w3=w3, out_dir=tmp_path)
    assert not list(tmp_path.iterdir())


def test_refuses_a_network_that_does_not_match_the_node(chain, tmp_path):
    w3 = chain.connect()[0]                           # the local node is chain 31337
    address, tx, _ = deploy_fresh(w3, "IntegrityRegistry")
    with pytest.raises(rd.RegistrationError, match="chain id"):
        rd.register("IntegrityRegistry", address, tx, network="sepolia", w3=w3, out_dir=tmp_path)


def test_refuses_an_address_with_no_code(chain, tmp_path):
    w3 = chain.connect()[0]
    _, tx, _ = deploy_fresh(w3, "IntegrityRegistry")
    with pytest.raises(rd.RegistrationError):
        rd.register("IntegrityRegistry", "0x000000000000000000000000000000000000dEaD", tx,
                    network="local", w3=w3, out_dir=tmp_path)


def test_refuses_a_contract_owned_by_a_different_account(chain, tmp_path):
    w3 = chain.connect()[0]
    address, tx, _ = deploy_fresh(w3, "IntegrityRegistry")        # owned by dev account 0
    with pytest.raises(rd.RegistrationError, match="owned by"):
        rd.register("IntegrityRegistry", address, tx, network="local", w3=w3, out_dir=tmp_path,
                    expected_owner=w3.eth.accounts[1])


def test_unknown_network_is_rejected(chain, tmp_path):
    w3 = chain.connect()[0]
    address, tx, _ = deploy_fresh(w3, "IntegrityRegistry")
    with pytest.raises(rd.RegistrationError):
        rd.register("IntegrityRegistry", address, tx, network="mainnet", w3=w3, out_dir=tmp_path)
