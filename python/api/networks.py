"""Per-network settings for the API: which chain, which database, and whether it is usable now."""
import threading
from dataclasses import dataclass, field
from pathlib import Path

import settings
from chain import Chain, ChainUnavailable, WrongNetwork

DATA_DIR = settings.PYTHON_DIR / "data"
SEPOLIA_BALANCE_FLOOR_WEI = 2 * 10**15          # 0.002 ETH: a write refuses to START below this
SEPOLIA_EXPLORER = "https://sepolia.etherscan.io"


@dataclass
class NetworkContext:
    id: str
    label: str
    chain: Chain | None
    db_path: Path
    explorer_base: str | None
    balance_floor_wei: int
    setup_reason: str | None = None            # a fixed reason this network cannot be used
    merkle_file: Path | None = None
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def unavailable_reason(self):
        """Why this network cannot be used right now, in plain words, or None if it can."""
        if self.setup_reason:
            return self.setup_reason
        try:
            self.chain.connect()
            return None
        except ChainUnavailable as exc:
            return self._plain(str(exc))
        except WrongNetwork as exc:
            return str(exc)
        except FileNotFoundError:
            return (f"No contracts are registered for {self.label}. "
                    "See docs/how-to-run.md (local) or docs/remix-guide.md (Sepolia).")

    def _plain(self, message):
        if "No contract at" in message:
            return ("The contracts are not deployed on this node (it was probably restarted). "
                    "Deploy them again, then reload.")
        if "not reachable" in message:
            if self.id == "local":
                return ("The local node is not reachable. Start it with `npx hardhat node` "
                        "and deploy the contracts, then reload.")
            return f"The {self.label} server is not reachable. Check your internet connection, then reload."
        return message


def build_registry(data_dir=None):
    """The real networks: the local chain and Sepolia (unavailable until configured)."""
    data_dir = Path(data_dir) if data_dir else DATA_DIR
    local_profile = settings.profile("local")
    local = NetworkContext(
        id="local", label="Local chain", chain=Chain.for_network("local"),
        db_path=data_dir / "local.db", explorer_base=None, balance_floor_wei=0,
        merkle_file=local_profile["merkle_deployment_file"])

    try:
        profile = settings.profile("sepolia")
    except RuntimeError as exc:
        sepolia = NetworkContext(
            id="sepolia", label="Sepolia", chain=None, db_path=data_dir / "sepolia.db",
            explorer_base=SEPOLIA_EXPLORER, balance_floor_wei=SEPOLIA_BALANCE_FLOOR_WEI,
            setup_reason=f"Sepolia is not configured: {exc}")
    else:
        missing = None if profile["deployment_file"].exists() else (
            "No Sepolia deployment is registered. Register it with register_deployment.py "
            "(see docs/remix-guide.md).")
        sepolia = NetworkContext(
            id="sepolia", label="Sepolia",
            chain=Chain(rpc_url=profile["rpc_url"], deployment_file=profile["deployment_file"],
                        private_key=profile["private_key"]),
            db_path=data_dir / "sepolia.db", explorer_base=SEPOLIA_EXPLORER,
            balance_floor_wei=SEPOLIA_BALANCE_FLOOR_WEI, setup_reason=missing,
            merkle_file=profile["merkle_deployment_file"])
    return {"local": local, "sepolia": sepolia}
