import os

# Tests use their own fixed key, set before anything imports settings, so results
# never depend on (or leak) the real key in .env.
os.environ["INTEGRITY_SECRET_KEY"] = "test-secret-key-not-for-production"

import pytest

from chain import Chain, ChainUnavailable
from merkle_chain import MerkleChain
import db


@pytest.fixture(scope="session")
def _live_chain():
    c = Chain()
    try:
        c.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        pytest.skip(f"Local chain not available ({exc}). "
                    "Start 'npx hardhat node' and deploy the contract.")
    if c.anchored_records():
        pytest.exit("The local chain already holds anchored records (left by an earlier demo or a "
                    "manual run), so tests that expect a clean chain would fail confusingly. "
                    "Restart the node (npx hardhat node), redeploy the contracts, then run the "
                    "tests again.", returncode=3)
    return c


@pytest.fixture
def chain(_live_chain):
    """The real local chain, rolled back to a clean state after every test."""
    snapshot = _live_chain.snapshot()
    yield _live_chain
    _live_chain.revert(snapshot)


@pytest.fixture(scope="session")
def _live_merkle_chain():
    c = MerkleChain()
    try:
        c.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        pytest.skip(f"MerkleRegistry not available ({exc}). Run "
                    "'npx hardhat run scripts/deploy_merkle.js --network localhost'.")
    if c.batch_count():
        pytest.exit("MerkleRegistry already holds batches from an earlier run. Restart the node "
                    "(npx hardhat node), redeploy the contracts, then run the tests again.",
                    returncode=3)
    return c


@pytest.fixture
def merkle_chain(_live_merkle_chain):
    """The real MerkleRegistry on the local chain, rolled back after every test."""
    snapshot = _live_merkle_chain.snapshot()
    yield _live_merkle_chain
    _live_merkle_chain.revert(snapshot)


@pytest.fixture
def dead_chain():
    """A chain object pointing at a port where nothing is listening."""
    return Chain(rpc_url="http://127.0.0.1:9")


@pytest.fixture
def conn():
    connection = db.connect(":memory:")
    yield connection
    connection.close()
