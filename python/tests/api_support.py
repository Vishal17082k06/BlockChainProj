"""Shared helpers for the API tests (not a test file)."""
import json

from api.networks import NetworkContext

HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"   # public test key


def make_registry(chain, tmp_path, local_chain=None, balance_floor_wei=0):
    local = NetworkContext(id="local", label="Local chain", chain=local_chain or chain,
                           db_path=tmp_path / "local.db", explorer_base=None,
                           balance_floor_wei=balance_floor_wei)
    sepolia = NetworkContext(id="sepolia", label="Sepolia", chain=None, db_path=tmp_path / "sepolia.db",
                             explorer_base="https://sepolia.etherscan.io", balance_floor_wei=2 * 10**15,
                             setup_reason="Sepolia is not configured: add SEPOLIA_RPC_URL and "
                                          "SEPOLIA_PRIVATE_KEY to python/.env")
    return {"local": local, "sepolia": sepolia}


def events(response):
    """The NDJSON stream of a write, as a list of event dicts."""
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def stages(response):
    return [event["stage"] for event in events(response)]
