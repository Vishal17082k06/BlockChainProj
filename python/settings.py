import os
from pathlib import Path

from dotenv import load_dotenv

PYTHON_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PYTHON_DIR.parent

# Real environment variables win over .env (override=False is the default).
load_dotenv(PYTHON_DIR / ".env")


def secret_key() -> bytes:
    key = os.environ.get("INTEGRITY_SECRET_KEY")
    if not key:
        raise RuntimeError("INTEGRITY_SECRET_KEY is not set (see python/.env.example)")
    return key.encode("utf-8")


def rpc_url() -> str:
    return os.environ.get("CHAIN_RPC_URL", "http://127.0.0.1:8545")


def deployment_file() -> Path:
    override = os.environ.get("DEPLOYMENT_FILE")
    return Path(override) if override else PROJECT_ROOT / "blockchain" / "deployment.json"


def merkle_deployment_file() -> Path:
    override = os.environ.get("MERKLE_DEPLOYMENT_FILE")
    return Path(override) if override else PROJECT_ROOT / "blockchain" / "merkle_deployment.json"


def profile(name: str = "local") -> dict:
    """Connection settings for a named network."""
    if name == "local":
        return {"rpc_url": rpc_url(), "deployment_file": deployment_file(),
                "merkle_deployment_file": merkle_deployment_file(), "private_key": None}
    if name == "sepolia":
        url = os.environ.get("SEPOLIA_RPC_URL")
        key = os.environ.get("SEPOLIA_PRIVATE_KEY")
        if not url or not key:
            raise RuntimeError("SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY must be set in python/.env")
        chain_dir = PROJECT_ROOT / "blockchain"
        return {"rpc_url": url,
                "deployment_file": chain_dir / "deployment.sepolia.json",
                "merkle_deployment_file": chain_dir / "merkle_deployment.sepolia.json",
                "private_key": key}
    raise ValueError(f"Unknown network profile: {name!r}")
