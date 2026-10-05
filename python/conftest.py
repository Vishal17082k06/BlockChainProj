import os

# Tests use their own fixed key, set before anything imports settings, so results
# never depend on (or leak) the real key in .env.
os.environ["INTEGRITY_SECRET_KEY"] = "test-secret-key-not-for-production"

import pytest

from chain import Chain, ChainUnavailable
import db


@pytest.fixture(scope="session")
def _live_chain():
    c = Chain()
    try:
        c.connect()
    except (ChainUnavailable, FileNotFoundError) as exc:
        pytest.skip(f"Local chain not available ({exc}). "
                    "Start 'npx hardhat node' and deploy the contract.")
    return c


@pytest.fixture
def chain(_live_chain):
    """The real local chain, rolled back to a clean state after every test."""
    snapshot = _live_chain.snapshot()
    yield _live_chain
    _live_chain.revert(snapshot)


@pytest.fixture
def dead_chain():
    """A chain object pointing at a port where nothing is listening."""
    return Chain(rpc_url="http://127.0.0.1:9")


@pytest.fixture
def conn():
    connection = db.connect(":memory:")
    yield connection
    connection.close()
