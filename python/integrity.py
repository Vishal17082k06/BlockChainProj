import hmac

from hashing import canonical_bytes, keyed_hash
from chain import ChainUnavailable

# Whitelist: table and column names are never taken from user input.
RECORD_SPECS = {
    "note": {"table": "note", "pk": "noteid",
             "fields": ["noteid", "interactionid", "content"]},
}


def _spec(record_type):
    if record_type not in RECORD_SPECS:
        raise ValueError(f"Unknown record type: {record_type!r}")
    return RECORD_SPECS[record_type]


def fetch_record(conn, record_type, record_id):
    spec = _spec(record_type)
    # Names come from the whitelist above; the value goes through a ? placeholder.
    sql = f"SELECT {', '.join(spec['fields'])} FROM {spec['table']} WHERE {spec['pk']} = ?"
    row = conn.execute(sql, (record_id,)).fetchone()
    return dict(row) if row else None


def compute_digest(record_type, record):
    return keyed_hash(canonical_bytes(record_type, record, _spec(record_type)["fields"]))


def anchor_record(conn, chain, record_type, record_id):
    record = fetch_record(conn, record_type, record_id)
    if record is None:
        raise ValueError("Record not found")
    digest = compute_digest(record_type, record)
    result = chain.anchor(record_type, record_id, digest)
    # The local log is a convenience copy only. Verification never reads it.
    conn.execute(
        "INSERT INTO integrity_log (record_type, record_id, version, record_hash, "
        "tx_hash, block_number) VALUES (?, ?, ?, ?, ?, ?)",
        (record_type, record_id, result["version"], digest.hex(),
         result["tx_hash"], result["block_number"]))
    conn.commit()
    return result


def verify_record(conn, chain, record_type, record_id):
    _spec(record_type)
    base = {"record_type": record_type, "record_id": record_id}
    try:
        latest = chain.get_latest(record_type, record_id)
    except ChainUnavailable:
        return {**base, "status": "UNAVAILABLE"}

    record = fetch_record(conn, record_type, record_id)
    if latest["version"] == 0:
        status = "NOT_ANCHORED"
    elif record is None:
        status = "DELETED_AUTHORIZED" if latest["is_deleted"] else "MISSING_FROM_DB"
    elif latest["is_deleted"]:
        status = "INCONSISTENT"
    else:
        same = hmac.compare_digest(compute_digest(record_type, record), latest["hash"])
        status = "VERIFIED" if same else "TAMPERED"
    return {**base, "status": status, "version": latest["version"],
            "anchored_at_unix": latest["timestamp"]}


def verify_all(conn, chain, record_type):
    spec = _spec(record_type)
    db_ids = {row[0] for row in conn.execute(f"SELECT {spec['pk']} FROM {spec['table']}")}
    try:
        # Ids from the chain's own event logs, so a row deleted together with its
        # integrity_log entries is still found.
        chain_ids = {rid for (rtype, rid) in chain.anchored_records() if rtype == record_type}
    except ChainUnavailable:
        chain_ids = set()      # each database id below will report UNAVAILABLE
    results = [verify_record(conn, chain, record_type, i) for i in sorted(db_ids | chain_ids)]
    summary = {}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    return {"summary": summary, "results": results}
