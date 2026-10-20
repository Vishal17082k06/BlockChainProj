# Step 04: Python environment

Date: 2026-10-05
Phase / Task: Phase 2, Task 2.1

## Goal
Get an isolated Python environment with `web3` (talks to the blockchain) and
`pytest` (runs our tests), and confirm it works on Python 3.14.

## Why this step exists
- A **virtual environment** (`python/.venv`) is a private copy of Python's
  package folder for this project. Libraries installed there do not affect
  other projects, and other projects cannot break ours.
- I flagged Python 3.14 as a risk because it is very new and some libraries lag
  behind. Better to find out now than in Phase 5.

## What we did
```
python -m venv python/.venv
python/.venv/Scripts/python.exe -m pip install --upgrade pip
python/.venv/Scripts/python.exe -m pip install web3 pytest
```
Then pinned the two direct dependencies in `python/requirements.txt`.
`.venv/` is already in `.gitignore`, so the roughly 40 downloaded packages are
not committed; anyone can rebuild them with
`pip install -r python/requirements.txt`.

Blast radius: downloads packages from PyPI into `python/.venv` only. No system
changes, no credentials, no network services started.

## Output / evidence
```
python 3.14.6 | web3 8.0.0
pytest 9.1.1
Web3.is_connected / to_checksum_address / to_hex / keccak: present
node reachable: False   (expected: no blockchain node is running yet)
```

## Findings
1. **Python 3.14 works.** Everything installed from prebuilt wheels; no need to
   install an older Python.
2. **web3 is v8.0.0, newer than the PDF's code assumed (v6/v7).** The PDF itself
   warns to check version-specific details. The basic functions we use exist,
   but details such as event-log parameter names may differ. We will find out
   for real in Task 5.2 when `chain.py` talks to a running node, and fix
   anything that breaks.
3. Limit of this check: it only confirmed that names exist. It did not
   exercise contract calls, since there is no contract or node yet.

## Concepts met in this step
Virtual environment, pinning dependencies (added to `docs/concepts.md`).

## Simple vs "proper" choice
- Simple: `pip install web3` globally.
- Proper: a per-project virtual environment plus a pinned `requirements.txt`.
- Tradeoff: two extra commands now, in exchange for reproducible installs, no
  version clashes, and nothing leaking into the rest of your machine.

## What I should be able to explain after this
(Write this yourself: what is a virtual environment, and why do we pin exact
versions in `requirements.txt`?)
