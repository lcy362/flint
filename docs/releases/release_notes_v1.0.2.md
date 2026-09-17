# Release v1.0.2 — npm tarball shipped on GitHub Releases

> Release date: 2026-09-17

## Overview

v1.0.2 is a **patch release** on the delivery side: every GitHub Release now bundles the
npm package tarball as a downloadable asset, so each version can be installed straight
from the release page without depending on registry propagation timing.

## Usage

```bash
npm install -g flint-skills-hub   # or: npm run dev in the repo
flint                              # starts the server, opens the browser
./start.sh                         # one-click: banner → background → browser
```

If you want to try the packaged artifact from a specific release:

```bash
npm install -g ./flint-skills-hub-1.0.2.tgz
```

## What's New

### Features & Improvements
- **GitHub Releases now carry the npm tarball** (`flint-skills-hub-<version>.tgz`) as a
  download asset. Each version is directly installable from the release page, and the
  artifact can be inspected offline instead of waiting for the registry to serve it.