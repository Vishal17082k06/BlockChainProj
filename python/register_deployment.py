"""Connect a contract that was deployed BY HAND (for example in Remix) to our Python code.

Our code finds a contract through a small file (address, deployment block, ABI). This tool
writes that file, but only after checking everything that could go wrong:

  1. we are talking to the network we think we are (chain id),
  2. the code at the address is EXACTLY our compiled contract,
  3. the transaction you give really created that address and succeeded,
  4. the contract is owned by the wallet our code signs with (otherwise Python could not
     write to it).

Run (from python/), for example after deploying IntegrityRegistry in Remix:
    .\\.venv\\Scripts\\python.exe register_deployment.py IntegrityRegistry 0xCONTRACT_ADDRESS 0xTX_HASH --network sepolia
"""
import json
import os
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

import check_deployment
import settings

CHAIN_IDS = {"local": 31337, "sepolia": 11155111}          # the only networks we ever register
PREFIX = {"IntegrityRegistry": "deployment", "MerkleRegistry": "merkle_deployment"}


class RegistrationError(Exception):
    """Something about the deployment is not what we expect; nothing was written."""


def _rpc_url(network):
    if network == "local":
        return settings.rpc_url()
    url = os.environ.get("SEPOLIA_RPC_URL")
    if not url:
        raise RegistrationError("SEPOLIA_RPC_URL is not set in python/.env")
    return url


def register(contract_name, address, tx_hash, network="sepolia", w3=None,
             out_dir=None, expected_owner=None):
    """Validate the deployment and write its file. Returns the path written."""
    if network not in CHAIN_IDS:
        raise RegistrationError(f"Unknown network {network!r}; allowed: {sorted(CHAIN_IDS)}")
    if contract_name not in PREFIX:
        raise RegistrationError(f"Unknown contract {contract_name!r}; allowed: {sorted(PREFIX)}")
    w3 = w3 or Web3(Web3.HTTPProvider(_rpc_url(network)))
    address = Web3.to_checksum_address(address)

    # 1. right network
    if w3.eth.chain_id != CHAIN_IDS[network]:
        raise RegistrationError(
            f"The node reports chain id {w3.eth.chain_id}, but {network} is {CHAIN_IDS[network]}")

    # 2. the code is ours
    if not check_deployment.check(w3, address, contract_name):
        raise RegistrationError(
            f"The code at {address} is not our compiled {contract_name} "
            "(or there is no code there). Wrong address, wrong file, or different compiler settings.")

    # 3. the transaction created exactly this address and succeeded
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    if receipt["status"] != 1:
        raise RegistrationError("That transaction failed on the chain")
    if receipt.get("contractAddress") != address:
        raise RegistrationError(
            f"That transaction did not create {address} (it created {receipt.get('contractAddress')})")

    # 4. our signing wallet owns it
    artifact = check_deployment.load_artifact(contract_name)
    owner = w3.eth.contract(address=address, abi=artifact["abi"]).functions.owner().call()
    if expected_owner is None and network == "sepolia":
        expected_owner = Account.from_key(settings.profile("sepolia")["private_key"]).address
    if expected_owner is not None and Web3.to_checksum_address(expected_owner) != owner:
        raise RegistrationError(
            f"The contract is owned by {owner}, not by {expected_owner}. "
            "Only the owner can anchor hashes, so our code could not use it.")

    folder = Path(out_dir) if out_dir else settings.PROJECT_ROOT / "blockchain"
    suffix = "" if network == "local" else f".{network}"
    out = folder / f"{PREFIX[contract_name]}{suffix}.json"
    out.write_text(json.dumps(
        {"address": address, "deploymentBlock": receipt["blockNumber"], "abi": artifact["abi"]}, indent=2))
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    net = sys.argv[sys.argv.index("--network") + 1] if "--network" in sys.argv else "sepolia"
    if net in args:
        args.remove(net)
    if len(args) != 3:
        sys.exit("Usage: register_deployment.py <IntegrityRegistry|MerkleRegistry> <address> <tx hash> [--network sepolia|local]")
    try:
        path = register(args[0], args[1], args[2], network=net)
    except RegistrationError as exc:
        sys.exit(f"NOT registered: {exc}")
    print(f"Registered. Wrote {path}")
