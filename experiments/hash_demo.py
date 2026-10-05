"""Experiment 1.1: what a hash is, what HMAC adds, and why canonical form matters.

Run:  python hash_demo.py
Only uses Python's standard library.
"""
import hashlib
import hmac
import json


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def count_differences(a: str, b: str) -> int:
    return sum(1 for x, y in zip(a, b) if x != y)


# ---------------------------------------------------------------------------
# Part 1: SHA-256 and the avalanche effect
# ---------------------------------------------------------------------------
print("=== Part 1: SHA-256 and the avalanche effect ===")
a = "Doctor appointment on 20 April at 10:00 AM"
b = "Doctor appointment on 20 April at 10:30 AM"
ha, hb = sha256_hex(a), sha256_hex(b)
print("Input A :", a)
print("SHA-256 :", ha)
print("Input B :", b)
print("SHA-256 :", hb)
print(f"Characters that differ: {count_differences(ha, hb)} of {len(ha)}")
print("Same input twice gives the same hash:", sha256_hex(a) == sha256_hex(a))
print("A very short and a very long input both give",
      len(sha256_hex("a")), "and", len(sha256_hex("a" * 100000)), "hex characters")

# ---------------------------------------------------------------------------
# Part 2: HMAC, a hash that needs a secret key
# ---------------------------------------------------------------------------
print("\n=== Part 2: plain hash vs HMAC (keyed hash) ===")
secret_note = "yes"
plain = sha256_hex(secret_note)
print("Plain SHA-256 of a short, guessable note:", plain)

# An attacker who sees only the hash tries common guesses.
for guess in ["no", "maybe", "yes"]:
    if sha256_hex(guess) == plain:
        print(f"  Attacker guessed it: the note was {guess!r}")

key1, key2 = b"correct-secret-key", b"attacker-guess-key"
tag = hmac.new(key1, secret_note.encode(), hashlib.sha256).hexdigest()
print("HMAC with the real key :", tag)
print("HMAC with another key  :",
      hmac.new(key2, secret_note.encode(), hashlib.sha256).hexdigest())
print("Without the real key the attacker cannot reproduce the HMAC, "
      "so guessing 'yes' no longer works.")

# ---------------------------------------------------------------------------
# Part 3: why we serialise records as canonical JSON
# ---------------------------------------------------------------------------
print("\n=== Part 3: joining fields as plain text is ambiguous ===")
rec1 = (1, "23")    # interaction id 1, content "23"
rec2 = (12, "3")    # interaction id 12, content "3"
naive1 = f"{rec1[0]}{rec1[1]}"
naive2 = f"{rec2[0]}{rec2[1]}"
print("Naive join:", repr(naive1), "vs", repr(naive2),
      "-> same hash?", sha256_hex(naive1) == sha256_hex(naive2))


def canonical(interactionid, content):
    return json.dumps({"interactionid": interactionid, "content": content},
                      sort_keys=True, separators=(",", ":"), ensure_ascii=False)


c1, c2 = canonical(*rec1), canonical(*rec2)
print("Canonical JSON:", c1, "vs", c2,
      "-> same hash?", sha256_hex(c1) == sha256_hex(c2))

print("\nKey order must not matter either:")
x = json.dumps({"a": 1, "b": 2}, sort_keys=True, separators=(",", ":"))
y = json.dumps({"b": 2, "a": 1}, sort_keys=True, separators=(",", ":"))
print("  ", x, "==", y, "->", x == y)
