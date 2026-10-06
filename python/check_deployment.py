"""Check that the code living at an address on a blockchain is EXACTLY one of our contracts.

Why this matters: anyone can deploy a contract with the same name. Before we trust an
address (for example one deployed by hand in Remix), we compare the code stored on the
chain with the code we compiled ourselves from blockchain/contracts/.

Run (from python/), after `npx hardhat compile` has produced the artifacts:
    .\\.venv\\Scripts\\python.exe check_deployment.py                 # the local node
    .\\.venv\\Scripts\\python.exe check_deployment.py --network sepolia
"""
import json
import sys

from web3 import Web3

import settings

_ARTIFACTS = settings.PROJECT_ROOT / "blockchain" / "artifacts" / "contracts"
CONTRACTS = {
    "IntegrityRegistry": _ARTIFACTS / "IntegrityRegistry.sol" / "IntegrityRegistry.json",
    "MerkleRegistry": _ARTIFACTS / "MerkleRegistry.sol" / "MerkleRegistry.json",
}


def load_artifact(contract_name: str) -> dict:
    if contract_name not in CONTRACTS:
        raise ValueError(f"Unknown contract: {contract_name!r}")
    path = CONTRACTS[contract_name]
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Run `npx hardhat compile` in blockchain/ first.")
    return json.loads(path.read_text())


def strip_metadata(code: bytes) -> bytes:
    """Solidity appends a metadata blob to the code; its last two bytes give its length.

    The blob includes a hash that changes with the source file's name and path, so two
    identical contracts compiled in different tools can differ ONLY there.
    """
    if len(code) < 2:
        return code
    length = int.from_bytes(code[-2:], "big")
    if length + 2 > len(code):
        return code                       # not a plausible trailer: leave it alone
    return code[: -(length + 2)]


def same_logic(onchain: bytes, expected: bytes) -> bool:
    return strip_metadata(onchain) == strip_metadata(expected)


def check(w3, address: str, contract_name: str) -> bool:
    """True if the code at `address` is our compiled `contract_name` (ignoring metadata)."""
    artifact = load_artifact(contract_name)
    onchain = bytes(w3.eth.get_code(Web3.to_checksum_address(address)))
    if not onchain:
        return False
    return same_logic(onchain, bytes.fromhex(artifact["deployedBytecode"][2:]))


def _main(network: str) -> int:
    url = settings.rpc_url() if network == "local" else settings.profile(network)["rpc_url"]
    w3 = Web3(Web3.HTTPProvider(url))
    if not w3.is_connected():
        print(f"Cannot reach {url}")
        return 2
    prof = {"local": settings.profile("local")}.get(network)
    if prof is None:                      # sepolia: only the public settings are needed here
        import os
        prof = settings.profile(network) if os.environ.get("SEPOLIA_PRIVATE_KEY") else None
    files = {
        "IntegrityRegistry": (prof or {}).get("deployment_file"),
        "MerkleRegistry": (prof or {}).get("merkle_deployment_file"),
    }
    bad = 0
    print(f"network chain id {w3.eth.chain_id}")
    for name, path in files.items():
        if path is None or not path.exists():
            print(f"  {name:<18} no deployment file recorded")
            continue
        address = json.loads(path.read_text())["address"]
        ok = check(w3, address, name)
        print(f"  {name:<18} {address}  {'MATCHES our compiled code' if ok else 'DOES NOT MATCH'}")
        bad += 0 if ok else 1
    return 1 if bad else 0


if __name__ == "__main__":
    net = sys.argv[sys.argv.index("--network") + 1] if "--network" in sys.argv else "local"
    sys.exit(_main(net))
