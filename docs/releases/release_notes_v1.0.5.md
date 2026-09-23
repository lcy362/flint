# Release v1.0.5 — Skill lists now reflect the directory itself

> Release date: 2026-09-23

## Overview

v1.0.5 is a **patch release** that finishes the move to a file-system-first model: an agent's or
project's skill list shows exactly what is physically in the directory, and skills enter it in a
single shot ("Apply preset" / "Add") instead of being tracked by an on/off switch. The
copy-mode watcher — which no longer had anything to do — and its Settings switch are gone, and
the badges and hints that still promised automatic syncing have been corrected.

## Usage

```bash
npm install -g flint-skills-hub   # update an existing install
flint -v                           # check the version in use
flint                              # starts the server, opens the browser
```

No migration needed: existing configuration, repositories and skill directories keep working.
Historical `explicitOn` / `explicitOff` / `watchers` fields in `~/.flint/config.json` are ignored
on load and disappear the next time the file is written.

## What's New

### Features & Improvements

- **Skill lists are directory-authoritative.** An agent's (or a project's) skills page lists what
  the directory actually contains — nothing more. A skill is placed with **"Add from the vault"**
  or **"Apply preset"**, and removed with **"Delete"**; there is no enable/disable switch and no
  expected set kept behind the scenes.
- **Presets are applied once, explicitly.** Linking a preset only records the decision; pressing
  "Apply preset" deploys its members into that directory once. Later membership or linked-tag
  changes do not sync on their own — apply again to pick them up.
- **The copy-mode watcher is retired.** With no automatic deployment left to drive, the directory
  watcher had nothing to do (the vault is re-scanned per request, never cached), so its
  implementation, the `watchers` config field and the Settings switch were removed together. A
  copy-mode skill that changes in the vault needs one explicit re-deploy for that directory.

### Bug Fixes

- **Third-party skills are cleaned up correctly.** Links deployed by this tool for skills coming
  from a read-only third-party source are now recognized as tool-deployed, so deleting them
  removes the link instead of reporting it as a foreign link that must be left alone.
- **Copy that described removed behaviour is gone.** Badges, tooltips and hints that still talked
  about automatic syncing, per-skill switches, "distribution baselines" or an inactive-directory
  follow-up were rewritten to match what the tool actually does (Agents, Presets, Library badge
  guide, Settings).

---
No migration needed.
