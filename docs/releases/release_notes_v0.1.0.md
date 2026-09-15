# Release v0.1.0 — Local-first AI skills manager, now installable with npx

> Release date: 2026-09-15

## Overview

v0.1.0 is the **first public release** of Flint (`flint-skills-hub`) — a local-first personal
AI **skills** asset manager. It gathers the skill directories scattered across your AI agents
and projects into one place, deduplicates them, tags them, and distributes them back on demand.
Your skills stay plain `SKILL.md` directories on your own disk; nothing is locked into a
proprietary database, and no account or cloud is involved. This release also makes the whole
thing installable and runnable with a single `npx` command.

## Usage

Install globally, or run it straight away without installing:

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

The server refuses to start if the port is already taken, and tells you how to pick another one.
Configuration lives in `~/.skills-hub/config.json`; logs in `~/.skills-hub/logs/app.log`.

From source instead of npm:

```bash
git clone https://github.com/lcy362/flint.git && cd flint
npm install && npm run build && ./start.sh
```

## What's New

### Features & Improvements

- **Skill library** — browse, search and filter every skill you own in one place, preview its
  `SKILL.md`, edit tags, and see where each skill came from. Register your own repositories as
  well as third-party sources, collect skills out of agent directories, or import them from
  folders you already have.
- **Agent distribution** — one card per real skill directory. Agents that share a directory are
  merged into a single card and share a single strategy, because a directory can only ever hold
  one truth. Mark agents active, override their directories, sync manually, link a preset, and
  toggle individual skills — per skill, as a symlink or as a copy.
- **Presets** — a named bundle of skills: explicit members plus everything matching linked tags.
  There is no separate enable switch, because the preset *is* the decision; change its members or
  tags and active agents pick it up immediately.
- **Projects** — register a project with tags and the desired skill set derives itself. Skill
  bodies are copied into the project's `.agents/skills` (so they can be committed alongside the
  code) and linked into each agent's project directory. Collect, take over, and push edits back
  to your repository.
- **Health & Settings** — diagnostics for missing repositories, broken links, duplicate skills
  and required structure, each with a one-click fix; plus global defaults for install mode and
  the copy-mode watcher.
- **Distributable build** — the server now serves the built web UI, so the published package runs
  as a self-contained application instead of requiring a separate frontend dev server.

### Bug Fixes

- **Duplicate tags are no longer reported twice.** A skill declaring tags both at the top level
  and under `metadata` (the agentskills.io location) previously showed each shared tag twice in
  the UI and could be counted twice when matching presets by tag. The two sources are now merged
  and deduplicated, with top-level tags keeping their precedence.
- **The built server starts correctly.** The compiled output contained extension-less imports in
  the i18n module, which Node's ESM loader rejects, so running the production build failed
  immediately. Relative imports now carry explicit `.js` extensions.

---

No breaking changes and no migration are required — this is the first release.
