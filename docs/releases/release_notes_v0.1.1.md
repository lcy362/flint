# Release v0.1.1 — Release pipeline verification

> Release date: 2026-09-15

## Overview

v0.1.1 is a **verification release with no functional changes to the package**:
`flint-skills-hub@0.1.1` contains exactly the same code as `0.1.0`. It exists to exercise the
release pipeline itself, which now publishes through GitHub Actions using an OpenID Connect
(OIDC) identity rather than a stored npm token. **If you are on v0.1.0 there is no reason to
upgrade** — nothing about how Flint behaves has changed.

## Usage

Unchanged from v0.1.0:

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

Configuration lives in `~/.skills-hub/config.json`; logs in `~/.skills-hub/logs/app.log`.

## What's New

### Features & Improvements

None — this release changes nothing in the packaged application.

### Bug Fixes

None.

---

**Note for maintainers:** releases are now published via OIDC trusted publishing. No
`NPM_TOKEN` secret exists in the repository and no long-lived npm credential is stored
anywhere. See `docs/RELEASE.md` for the release process.
