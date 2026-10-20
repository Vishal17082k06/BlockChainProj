import json
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request

import integrity
from chain import ChainUnavailable

from . import store
from .deps import require_network

router = APIRouter()


def _eth(wei: int) -> str:
    return format(Decimal(wei) / Decimal(10**18), ".6f")


def _merkle_address(ctx):
    if ctx.merkle_file is not None and ctx.merkle_file.exists():
        return json.loads(ctx.merkle_file.read_text()).get("address")
    return None


def _describe(ctx) -> dict:
    reason = ctx.unavailable_reason()
    info = {"id": ctx.id, "label": ctx.label, "ready": reason is None, "reason": reason,
            "chainId": None, "blockNumber": None, "wallet": None, "balanceEth": None, "owner": None,
            "contracts": {"integrity": None, "merkle": _merkle_address(ctx)},
            "explorer": ctx.explorer_base}
    if reason is None:
        try:
            st = ctx.chain.status()
        except ChainUnavailable as exc:
            info["ready"], info["reason"] = False, str(exc)
        else:
            info.update(chainId=st["chain_id"], blockNumber=st["block_number"], wallet=st["wallet"],
                        balanceEth=_eth(st["balance_wei"]), owner=st["owner"])
            info["contracts"]["integrity"] = ctx.chain.address
    return info


def collect(ctx) -> dict:
    """Every note with its live status, newest first (includes records only the chain knows)."""
    conn = store.open_db(ctx)
    try:
        rows = {r["noteid"]: r["content"] for r in conn.execute("SELECT noteid, content FROM note")}
    finally:
        conn.close()
    chain_ids = {rid for (rtype, rid) in ctx.chain.anchored_records() if rtype == "note"}
    ids = sorted(set(rows) | chain_ids, reverse=True)

    def verdict(record_id):
        connection = store.connect_existing(ctx)        # SQLite needs one connection per thread
        try:
            return integrity.verify_record(connection, ctx.chain, "note", record_id)
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=min(8, max(1, len(ids)))) as pool:
        results = list(pool.map(verdict, ids))

    records, summary = [], {}
    for record_id, result in zip(ids, results):
        records.append({
            "id": record_id, "content": rows.get(record_id), "status": result["status"],
            "version": result.get("version"), "anchoredAt": result.get("anchored_at_unix") or None,
            "inDatabase": record_id in rows})
        summary[result["status"]] = summary.get(result["status"], 0) + 1
    return {"summary": summary, "records": records}


@router.get("/networks")
def networks(request: Request):
    return [_describe(ctx) for ctx in request.app.state.registry.values()]


@router.get("/{net}/records")
def list_records(request: Request, net: str):
    return collect(require_network(request, net))


@router.post("/{net}/verify-all")
def verify_all(request: Request, net: str):
    found = collect(require_network(request, net))
    return {"summary": found["summary"], "results": found["records"]}


@router.get("/{net}/records/{record_id}")
def record_detail(request: Request, net: str, record_id: int):
    ctx = require_network(request, net)
    chain = ctx.chain
    conn = store.open_db(ctx)
    try:
        row = integrity.fetch_record(conn, "note", record_id)
        verdict = integrity.verify_record(conn, chain, "note", record_id)
    finally:
        conn.close()
    latest = chain.get_latest("note", record_id)
    if row is None and latest["version"] == 0:
        raise HTTPException(404, "No such record")
    history = chain.history("note", record_id)

    database_hash = integrity.compute_digest("note", row).hex() if row else None
    chain_hash = latest["hash"].hex() if latest["version"] > 0 else None

    def link(tx_hash):
        return f"{ctx.explorer_base}/tx/{tx_hash}" if ctx.explorer_base else None

    deletion = history["deleted"]
    return {
        "id": record_id,
        "status": verdict["status"],
        "row": {"content": row["content"]} if row else None,
        "fingerprint": {"database": database_hash, "chain": chain_hash,
                        "matches": database_hash is not None and database_hash == chain_hash},
        "deleted": latest["is_deleted"],
        "versions": [{"version": v["version"], "hash": v["hash"].hex(), "timestamp": v["timestamp"],
                      "txHash": v["tx_hash"], "block": v["block_number"],
                      "explorerUrl": link(v["tx_hash"])} for v in history["versions"]],
        "deletion": ({"txHash": deletion["tx_hash"], "block": deletion["block_number"],
                      "timestamp": deletion["timestamp"], "explorerUrl": link(deletion["tx_hash"])}
                     if deletion else None),
    }
