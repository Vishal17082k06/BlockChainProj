import hashlib
import hmac
import json
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal

import settings

SCHEMA_VERSION = 1   # bump if the canonical format or field lists ever change


def _normalise(value):
    if value is None:
        return None
    if isinstance(value, datetime):               # check before date: datetime is a date
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)   # treat naive timestamps as UTC
        return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    return value


def canonical_bytes(record_type: str, record: dict, fields: list) -> bytes:
    """One exact, unambiguous byte string for a record (PDF 7.2)."""
    data = {f: _normalise(record[f]) for f in sorted(fields)}
    payload = {"type": record_type, "v": SCHEMA_VERSION, "data": data}
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")


def keyed_hash(payload: bytes) -> bytes:
    """HMAC-SHA256 with the secret key. 32 bytes, exactly a Solidity bytes32."""
    return hmac.new(settings.secret_key(), payload, hashlib.sha256).digest()
