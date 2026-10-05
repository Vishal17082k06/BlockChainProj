from datetime import datetime, timezone, timedelta

import pytest

import hashing
from hashing import canonical_bytes, keyed_hash

FIELDS = ["noteid", "interactionid", "content"]


def rec(**overrides):
    base = {"noteid": 7, "interactionid": 1, "content": "hello"}
    base.update(overrides)
    return base


def test_golden_format_is_frozen():
    # If this fails, the canonical format changed and every existing hash is invalid.
    assert canonical_bytes("note", rec(), FIELDS) == \
        b'{"data":{"content":"hello","interactionid":1,"noteid":7},"type":"note","v":1}'


def test_same_input_same_bytes_and_hash():
    a = canonical_bytes("note", rec(), FIELDS)
    b = canonical_bytes("note", rec(), FIELDS)
    assert a == b
    assert keyed_hash(a) == keyed_hash(b)


def test_one_character_change_changes_hash():
    a = keyed_hash(canonical_bytes("note", rec(content="10:00 AM"), FIELDS))
    b = keyed_hash(canonical_bytes("note", rec(content="10:30 AM"), FIELDS))
    assert a != b


def test_dict_order_and_field_list_order_do_not_matter():
    shuffled = {"content": "hello", "noteid": 7, "interactionid": 1}
    assert canonical_bytes("note", shuffled, FIELDS) == canonical_bytes("note", rec(), FIELDS)
    assert canonical_bytes("note", rec(), list(reversed(FIELDS))) == canonical_bytes("note", rec(), FIELDS)


def test_unicode_normalisation_composed_vs_decomposed():
    composed = "café"          # e-acute as one character
    decomposed = "café"       # e followed by a combining accent
    assert canonical_bytes("note", rec(content=composed), FIELDS) == \
        canonical_bytes("note", rec(content=decomposed), FIELDS)


def test_non_latin_text_is_kept_not_escaped():
    out = canonical_bytes("note", rec(content="日本語"), FIELDS)
    assert "日本語".encode("utf-8") in out


def test_naive_datetime_is_treated_as_utc():
    naive = datetime(2026, 4, 20, 10, 0, 0)
    aware = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
    f = ["noteid", "when"]
    assert canonical_bytes("note", {"noteid": 1, "when": naive}, f) == \
        canonical_bytes("note", {"noteid": 1, "when": aware}, f)


def test_aware_datetime_in_other_zone_is_converted_to_utc():
    ist = timezone(timedelta(hours=5, minutes=30))
    local = datetime(2026, 4, 20, 15, 30, 0, tzinfo=ist)
    utc = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
    f = ["noteid", "when"]
    assert canonical_bytes("note", {"noteid": 1, "when": local}, f) == \
        canonical_bytes("note", {"noteid": 1, "when": utc}, f)


def test_none_and_empty_string_differ():
    assert canonical_bytes("note", rec(content=None), FIELDS) != \
        canonical_bytes("note", rec(content=""), FIELDS)


def test_field_boundaries_cannot_be_confused():
    # The naive join "1"+"23" == "12"+"3" collision from experiments/hash_demo.py.
    a = canonical_bytes("note", rec(interactionid=1, content="23"), FIELDS)
    b = canonical_bytes("note", rec(interactionid=12, content="3"), FIELDS)
    assert a != b


def test_record_type_is_part_of_the_hash():
    assert canonical_bytes("note", rec(), FIELDS) != canonical_bytes("conversation", rec(), FIELDS)


def test_unlisted_columns_are_ignored():
    extra = rec(created_at="2026-01-01")
    assert canonical_bytes("note", extra, FIELDS) == canonical_bytes("note", rec(), FIELDS)


def test_missing_listed_field_raises():
    with pytest.raises(KeyError):
        canonical_bytes("note", {"noteid": 1, "interactionid": 1}, FIELDS)


def test_keyed_hash_is_32_bytes_and_depends_on_key(monkeypatch):
    payload = canonical_bytes("note", rec(), FIELDS)
    h1 = keyed_hash(payload)
    assert isinstance(h1, bytes) and len(h1) == 32
    monkeypatch.setenv("INTEGRITY_SECRET_KEY", "a-different-key")
    assert keyed_hash(payload) != h1


def test_missing_key_raises(monkeypatch):
    monkeypatch.delenv("INTEGRITY_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        keyed_hash(b"anything")
