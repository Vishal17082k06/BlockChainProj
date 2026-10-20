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


def test_sepolia_key_exported_from_metamask_without_0x_is_accepted(monkeypatch):
    # MetaMask shows a private key as 64 hex characters with no 0x prefix.
    monkeypatch.setenv("SEPOLIA_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("SEPOLIA_PRIVATE_KEY", "ab" * 32)
    assert settings.profile("sepolia")["private_key"] == "0x" + "ab" * 32


def test_sepolia_key_with_stray_whitespace_is_cleaned(monkeypatch):
    monkeypatch.setenv("SEPOLIA_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("SEPOLIA_PRIVATE_KEY", "  0x" + "cd" * 32 + "  ")
    assert settings.profile("sepolia")["private_key"] == "0x" + "cd" * 32


def test_sepolia_key_of_the_wrong_shape_is_rejected_without_echoing_it(monkeypatch):
    monkeypatch.setenv("SEPOLIA_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("SEPOLIA_PRIVATE_KEY", "not-a-key-SECRET123")
    with pytest.raises(RuntimeError) as excinfo:
        settings.profile("sepolia")
    assert "SECRET123" not in str(excinfo.value)       # never leak key material in an error


def test_unknown_profile_is_rejected():
    with pytest.raises(ValueError):
        settings.profile("mainnet")
