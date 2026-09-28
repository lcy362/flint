# Release v1.0.6 — Distribute skills to agents, body search, source tracking

> Release date: 2026-09-28

## Overview

v1.0.6 is a **patch release** that rounds out the Library: a skill can now be distributed to
agents straight from its detail page, keyword search also matches `SKILL.md` bodies, and skills
collected from a git repository or a directory remember their source and can be refreshed from
it with one click.

## Usage

```bash
npm install -g flint-skills-hub   # update an existing install
flint -v                           # check the version in use
flint                              # starts the server, opens the browser
```

No migration needed: existing configuration, repositories and skill directories keep working.

## What's New

### Features & Improvements

- **Distribute a skill to agents from its detail page.** The skill detail page has a
  "Distribute to agents" action that opens a dialog listing every agent skill directory as a
  card — the same cards, search (name / key / directory), "installed only" filter and
  cards / list views as the Agents page. Turning a switch on deploys the skill into that
  directory once (symlink or copy, following the directory's strategy); turning it off removes
  the link / copy this tool deployed. Directories that hold the skill are listed first and the
  switch is disabled — with an explaining badge — for agent-owned directories and external
  symlinks, which this tool never deletes. The dialog answers "which agents already have this
  skill?" with a single fast lookup, and toggles apply in place without reloading the list.
- **The skill detail is now a page, not a dialog.** Opening a skill from the Library navigates
  to `#/library/<skill>`: metadata, tag editing, provenance, the `SKILL.md` preview and the
  distribute dialog live on one page, the URL stays shareable and refresh-safe, and "Back"
  returns to the list with filters intact.
- **Keyword search matches `SKILL.md` bodies.** The Library search box now finds skills by their
  content as well as by name, title and description; matches that only exist in the body are
  listed with the matching context, so it is clear why a skill turned up.
- **Provenance and update-from-source.** Skills collected from an agent or imported from a
  directory remember where they came from and when; the detail page shows the source, and
  "Update from source" copies the current source content over the repository copy (the source
  itself is never modified). Own repositories and third-party sources also show their git remote
  with ahead / behind counts, plus "Check updates" (fetch) and "Sync" (pull) actions.

---
No migration needed.
