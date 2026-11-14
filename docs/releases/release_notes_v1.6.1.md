# Release v1.6.1 — Faster library loads, installer home stays in the cage

> Release date: 2026-11-14

## Overview

This is a patch release. Opening the library no longer re-reads every skill and re-runs the content checks, and an `npx` installer can no longer follow `HOME` out of the managed directory into your real agent folders.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

Nothing in `~/.flint/config.json` changed shape. Sources you already registered stay where they are. Only a new or updated `npx` install uses the caged home described below.

## What's New

### Features & Improvements

- **The library reuses the last scan.** Skill lists are cached against each `SKILL.md`'s modification time and size, and dropped after a write. Refreshing a page or switching language keeps the current list on screen until the new data arrives, instead of clearing it first.
- **Content-health badges are remembered, not recomputed on every list.** The error and warning counts come from the last Health run or from opening that skill's content check. A skill you have not checked yet shows no badge. After its files change, the badge drops off until the next check.

### Bug Fixes

- **`npx` installs stay inside the cage.** The installer process sees its home directory as `<flint data>/sources/<id>/home`, so a tool that writes `~/.claude/skills` or `~/.agents/skills` lands there and can be registered. A global-only install no longer leaves the cage empty and blocks registration. The npm cache and `~/.npmrc` still use your real paths, so packages are not re-downloaded and private registries still work. An installer that writes an absolute path outside that home is still reported and not deleted.

---

### Notes

- Health badges on the library list appear after you open Health, or after you open that skill (the detail page runs its check). They are not computed just by loading the list.
- Known limitations that remain are tracked in `docs/TECH.md` (§15).
