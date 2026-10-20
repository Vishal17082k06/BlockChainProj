"""Run one write on a worker thread and stream its REAL stages as NDJSON lines.

Nothing here is simulated: every event is produced by the stage callbacks of the notes module
and the chain, at the moment the thing it describes actually happens.
"""
import json
import logging
import queue
import threading
import time
from decimal import Decimal

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from web3.exceptions import ContractLogicError

from chain import ChainUnavailable, TransactionFailed, WrongNetwork
from notes import IntegrityRefused

from . import store

log = logging.getLogger(__name__)

BUSY_MESSAGE = "Another write is still running. Wait for it to finish, then try again."
GENERIC_ERROR = "Something unexpected went wrong. The details were written to the API log."


class LowBalance(Exception):
    def __init__(self, balance_wei, floor_wei):
        super().__init__(
            f"The wallet holds {_eth(balance_wei, 6)} ETH, below the {_eth(floor_wei, 6)} ETH needed "
            "to start a write. Add test ETH from a faucet (see docs/remix-guide.md).")


def _eth(wei, places=9):
    return format(Decimal(wei) / Decimal(10**18), f".{places}f")


def describe_failure(exc):
    """(code, plain-language message) for an exception. Never includes secrets or internals."""
    if isinstance(exc, IntegrityRefused):
        return "REFUSED", (f"{exc}. The edit was not applied, because re-anchoring a record that "
                           "fails its check would make the forged text the new truth.")
    if isinstance(exc, LowBalance):
        return "LOW_BALANCE", str(exc)
    if isinstance(exc, WrongNetwork):
        return "WRONG_NETWORK", str(exc)
    if isinstance(exc, ChainUnavailable):
        return "CHAIN_UNAVAILABLE", f"{exc}. Check the node, then try again."
    if isinstance(exc, TransactionFailed):
        return "TX_FAILED", (f"{exc}. Look it up on the block explorer. "
                             "The fee for a failed transaction is not refunded.")
    if isinstance(exc, ContractLogicError):
        return "TX_FAILED", f"The contract rejected the transaction: {exc}"
    log.exception("Unexpected error during a write", exc_info=exc)
    return "INTERNAL", GENERIC_ERROR


def _to_event(name, payload, ctx):
    if name == "saved":
        return {"stage": "saved", "noteId": payload["note_id"]}
    if name == "fingerprint":
        return {"stage": "fingerprint", "hash": payload["hash"]}
    if name == "sent":
        tx = payload["tx_hash"]
        link = f"{ctx.explorer_base}/tx/{tx}" if ctx.explorer_base else None
        return {"stage": "sent", "txHash": tx, "explorerUrl": link}
    if name == "mined":
        event = {"stage": "mined", "block": payload["block"], "gasUsed": payload["gas_used"],
                 "feeWei": str(payload["fee_wei"]), "feeEth": _eth(payload["fee_wei"])}
        if payload.get("version") is not None:
            event["version"] = payload["version"]
        return event
    if name == "removed":
        return {"stage": "removed"}
    raise ValueError(f"Unknown stage {name!r}")


def _check_balance(ctx):
    if ctx.balance_floor_wei:
        balance = ctx.chain.status()["balance_wei"]
        if balance < ctx.balance_floor_wei:
            raise LowBalance(balance, ctx.balance_floor_wei)


def stream_write(ctx, work):
    """Stream a write. `work(conn, on_stage)` returns {"noteid": id}.

    One write at a time per network: a second request is refused with HTTP 409. The lock is
    released when the WORKER finishes (not when the client disconnects), so a dropped browser
    can never let two transactions overlap.
    """
    if not ctx.lock.acquire(blocking=False):
        raise HTTPException(409, BUSY_MESSAGE)
    events = queue.Queue()
    started = time.monotonic()

    def emit(event):
        event["t"] = int((time.monotonic() - started) * 1000)
        events.put(event)

    def worker():
        conn = None
        anchor_errors = []

        def on_stage(name, payload):
            if name == "anchor_failed":                 # the note was saved; anchoring did not work
                anchor_errors.append(payload["error"])
            else:
                emit(_to_event(name, payload, ctx))

        try:
            conn = store.open_db(ctx)
            _check_balance(ctx)
            outcome = work(conn, on_stage)
            if anchor_errors:
                code, message = describe_failure(anchor_errors[0])
                emit({"stage": "failed", "code": code,
                      "message": ("The note was saved, but it could not be anchored. " + message +
                                  " It shows as Not anchored yet; edit it to anchor it.")})
            else:
                emit({"stage": "done", "noteId": outcome["noteid"]})
        except Exception as exc:
            code, message = describe_failure(exc)
            emit({"stage": "failed", "code": code, "message": message})
        finally:
            if conn is not None:
                conn.close()
            ctx.lock.release()                          # free BEFORE the stream ends
            events.put(None)

    threading.Thread(target=worker, daemon=True, name=f"write-{ctx.id}").start()

    def generate():
        while True:
            item = events.get()
            if item is None:
                return
            yield (json.dumps(item) + "\n").encode("utf-8")

    return StreamingResponse(generate(), media_type="application/x-ndjson")
