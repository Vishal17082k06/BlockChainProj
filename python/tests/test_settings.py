import pytest

import settings


def test_local_profile_has_no_private_key():
    p = settings.profile("local")
    assert p["private_key"] is None
    assert p["deployment_file"].name == "deployment.json"
    assert p["merkle_deployment_file"].name == "merkle_deployment.json"


def test_sepolia_profile_needs_its_variables(monkeypatch):
    monkeypatch.delenv("SEPOLIA_RPC_URL", raising=False)
    monkeypatch.delenv("SEPOLIA_PRIVATE_KEY", raising=False)
    with pytest.raises(RuntimeError):
        settings.profile("sepolia")


def test_sepolia_profile_reads_its_variables(monkeypatch):
    monkeypatch.setenv("SEPOLIA_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("SEPOLIA_PRIVATE_KEY", "0x" + "11" * 32)
    p = settings.profile("sepolia")
    assert p["rpc_url"] == "https://rpc.example"
    assert p["private_key"] == "0x" + "11" * 32
    assert p["deployment_file"].name == "deployment.sepolia.json"
    assert p["merkle_deployment_file"].name == "merkle_deployment.sepolia.json"


def test_unknown_profile_is_rejected():
    with pytest.raises(ValueError):
        settings.profile("mainnet")
