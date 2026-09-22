# Release v1.0.4 — `flint -r` restarts a busy port

> Release date: 2026-09-22

## Overview

v1.0.4 is a **patch release** for the CLI: a new `-r` / `--restart` flag that force-stops
whatever already occupies the port and starts fresh. It also adds the package's npm badges
to the README and mirrors each release to GitHub Packages as `@lcy362/flint`.

## Usage

```bash
npm install -g flint-skills-hub   # or: npm run dev in the repo
flint                              # starts the server, opens the browser
flint -r                           # restart if the port is already in use
```

## What's New

### Features & Improvements

- **`flint -r` restarts on a busy port.** If port `8787` (or your `--port`) is already taken,
  `flint -r` finds the process holding it and force-stops it (graceful, then kill), waits for
  the port to free up, and starts a fresh instance. Without `-r` the CLI still refuses to start
  on a held port, and the error message now suggests `flint -r` as the fastest fix. Also works
  as `flint-skills-hub -r`.
- **Now mirrored to GitHub Packages.** Each release is also published to GitHub Packages as
  `@lcy362/flint`, so the package shows up in the GitHub sidebar and can be installed straight
  from GitHub's registry (`@lcy362:registry=https://npm.pkg.github.com`).
- **npm badges on the README.** Version, downloads and license badges link to the npm page.

---
No migration needed: existing configuration and behaviour are unchanged.