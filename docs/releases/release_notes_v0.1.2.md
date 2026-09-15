# Release v0.1.2 — Install from npm, now documented

> Release date: 2026-09-15

## Overview

v0.1.2 changes **documentation only** — the application code is identical to v0.1.0. What it fixes
is that Flint has been installable from npm since v0.1.0, yet the README still only explained how to
run it from a source checkout. The README is what you see on this package's page, so anyone landing
here was told to clone a repository they did not need. It now leads with the one-line install.

## Usage

Unchanged:

```bash
# One-shot run (no install):
npx flint-skills-hub

# Global install — both command names are registered:
npm install -g flint-skills-hub
flint
```

Then open **http://localhost:8787**.

```bash
flint --port 9000     # listen somewhere else (or PORT=9000 flint)
flint --no-open       # do not open the browser automatically
flint --help
```

Running from source is still documented further down in the README (`./start.sh`, or
`npm install && npm run dev`).

## What's New

### Features & Improvements

- **The README now documents installing straight from npm.** The quick start previously opened with
  a `git clone` + `./start.sh`; it now leads with `npx flint-skills-hub` and the global install,
  keeping the from-source paths below for contributors. The development section also lists
  `npm test` (unit tests) and `npm run smoke -w server`, and points at `docs/RELEASE.md`.

### Bug Fixes

None.

---

No breaking changes and no migration are required.
