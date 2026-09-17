# Release v1.0.1 — Smoother startup and clean config location

> Release date: 2026-09-17

## Overview

v1.0.1 is a **patch release** focused on the startup experience and on-site hygiene:
the one-click launcher now daemonizes, keeps noisy logs out of the console, prints a
clear banner and helpful restart hints, and correctly tells which process owns a port.
Configuration and logs also move from the old `~/.skills-hub` to `~/.flint`, and a few
leftover version badges were removed from the UI.

## Usage

```bash
npm install -g flint-skills-hub   # or: npm run dev in the repo
flint                              # starts the server, opens the browser
./start.sh                         # one-click: banner → background → browser
```

**Migrating existing data (only if you used a version before v1.0.1):** config and logs
move to a new location in this release. If you already have a setup under the old path,
move it once:

```bash
mkdir -p ~/.flint/logs
mv ~/.skills-hub/config.json ~/.flint/config.json
mv ~/.skills-hub/logs/app.log ~/.flint/logs/app.log
```

Environment overrides are renamed accordingly: `FLINT_CONFIG` replaces `SKILLS_HUB_CONFIG`
(config path), `FLINT_LOG_LEVEL` / `FLINT_LOG_MAX_MB` replace `SKILLS_HUB_LOG_LEVEL` /
`SKILLS_HUB_LOG_MAX_MB`. Runtime logs live under `~/.flint/logs/`.

## What's New

### Features & Improvements
- **Daemonized launcher:** `./start.sh` draws a `FLINT` banner, starts front and back
  end in the background, prints the ready URLs and then exits — the console is kept for
  essentials only, while full output goes to `~/.flint/logs/dev.log`.
- **Smarter "already running" check:** instead of assuming a port is busy, the launcher
  verifies whether the page is actually reachable. If this project is already up it
  reuses it (no kill), tells you it is safe to continue, and shows both restart options
  (`./start.sh -y` or `npm start`) plus where the logs are.
- **Process ownership is detected by working directory too,** so instances started via
  `npm start`, `npx flint-skills-hub`, or the repo's `node dist/index.js` are recognized
  as this project rather than as a foreign process occupying the port.

### Refactoring & Optimizations
- **Config and logs moved from `~/.skills-hub` to `~/.flint`**, and the `SKILLS_HUB_*`
  env vars were renamed to the `FLINT_*` family so the on-disk footprint matches the
  product name.

### Bug Fixes
- Removed leftover hardcoded version badges from the UI (sidebar and settings), while
  keeping each skill's own metadata version.
- The launcher banner now unmistakably reads `FLINT` across terminal fonts.

---

**Upgrade note:** this release relocates config/log files to `~/.flint` (see Usage).
No data is changed or lost — you only need to move the old files if you were using a
pre-v1.0.1 setup and want to keep that configuration.