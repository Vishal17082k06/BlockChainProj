# Step 01: Project setup

Date: 2026-10-05
Phase / Task: Phase 0, Tasks 0.1 and 0.2

## Goal
Create a clean, documented home for the project and a safe git workflow before
writing any real code.

## Why this step exists
- A dedicated folder keeps this project separate from anything else in the repo.
- `.gitignore` is set up first because the project will use a secret key
  (`INTEGRITY_SECRET_KEY`). Once a secret is committed it stays in git history
  even if you delete it later, so we block it before it can happen.
- A feature branch keeps `main` stable. Each task becomes one commit, so the
  history reads like this journal.

## What we did
- Created the project files (first inside a `blockchain-integrity/` subfolder, later flattened to the repo root) with `README.md`, `docs/00-master-plan.md`,
  `docs/concepts.md`, `docs/journal/_TEMPLATE.md` and this entry.
- Added `.gitignore` (secrets, dependencies, generated files).
- Created branch `feat/integrity-module` and committed.

## Output / evidence
(See the terminal output pasted below after verification.)

## Concepts met in this step
Git branch and `.gitignore` (defined in `docs/concepts.md`).

## Simple vs "proper" choice
- Simple: commit everything straight to `main`.
- Proper: work on a feature branch, one commit per task.
- Chosen: feature branch. It costs one extra command and lets us throw away or
  review the work as a unit.

## What I should be able to explain after this
(Write this yourself in your own words: why do we ignore `.env`, and why do we
use a branch?)
