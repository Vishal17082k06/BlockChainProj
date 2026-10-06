import json

import pytest

import check_deployment as cd


def test_metadata_trailer_is_stripped():
    logic = b"\x01\x02\x03\x04"
    metadata = b"\xaa" * 10
    code = logic + metadata + (10).to_bytes(2, "big")      # Solidity appends metadata + its length
    assert cd.strip_metadata(code) == logic


def test_code_without_a_plausible_trailer_is_left_alone():
    code = b"\x01\x02\xff\xff"                              # claims a 65535-byte trailer: not real
    assert cd.strip_metadata(code) == code


def test_same_logic_ignores_different_metadata():
    logic = b"\x60\x80\x60\x40"
    a = logic + b"\x11" * 8 + (8).to_bytes(2, "big")
    b = logic + b"\x22" * 8 + (8).to_bytes(2, "big")        # e.g. compiled from a different file path
    assert cd.same_logic(a, b)


def test_a_single_changed_logic_byte_is_detected():
    logic = b"\x60\x80\x60\x40"
    good = logic + b"\x11" * 8 + (8).to_bytes(2, "big")
    bad = bytes([logic[0] ^ 0x01]) + logic[1:] + b"\x11" * 8 + (8).to_bytes(2, "big")
    assert not cd.same_logic(good, bad)


def test_the_locally_deployed_contracts_match_our_compiled_artifacts(chain, _live_merkle_chain):
    w3 = chain.connect()[0]
    integrity = json.loads(open(chain._deployment_file).read())["address"]
    merkle = json.loads(open(_live_merkle_chain._deployment_file).read())["address"]
    assert cd.check(w3, integrity, "IntegrityRegistry")
    assert cd.check(w3, merkle, "MerkleRegistry")


def test_a_contract_is_not_mistaken_for_a_different_one(chain, _live_merkle_chain):
    w3 = chain.connect()[0]
    merkle = json.loads(open(_live_merkle_chain._deployment_file).read())["address"]
    assert not cd.check(w3, merkle, "IntegrityRegistry")


def test_an_address_with_no_code_does_not_match(chain):
    w3 = chain.connect()[0]
    assert not cd.check(w3, "0x000000000000000000000000000000000000dEaD", "IntegrityRegistry")


def test_unknown_contract_name_is_rejected(chain):
    w3 = chain.connect()[0]
    with pytest.raises(ValueError):
        cd.check(w3, "0x000000000000000000000000000000000000dEaD", "NotOurContract")
