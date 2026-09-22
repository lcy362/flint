# Release v1.0.3 — Shared skill directory shown as one entity

> Release date: 2026-09-22

## Overview

v1.0.3 is a **patch release** about how shared skill directories are presented. The
ecosystem-recommended directory (`~/.agents/skills`) is now marked on the directory itself
instead of on every agent that reads it, a directory gets a single detail page shared by all
of its agents, and the active toggle applies to the whole directory.

## Usage

```bash
npm install -g flint-skills-hub   # or: npm run dev in the repo
flint                              # starts the server, opens the browser
```

## What's New

### Features & Improvements

- **The ecosystem-recommended directory is called out on its own.** `~/.agents/skills` is
  read by most agents in the ecosystem, so an "also reads" badge on each of them carried no
  information. It is now marked **on the directory itself**: its card uses a dedicated accent
  colour with the title "Ecosystem-recommended directory", an info button explaining which
  agents are its current representatives, and it sorts first within both the active and the
  inactive groups. Only `~/.agents/skills` is styled this way — other shared directories such
  as `~/.config/agents/skills` render as ordinary cards.
- **One detail page per skill directory.** Agents that share a directory no longer get one
  page each: the title lists the whole group (`Codex / OpenHands / Warp`), the agent names are
  no longer individually clickable, and a URL pointing at a single member is redirected to the
  shared page. The "primary / alias" badges are gone — a directory is one thing.
- **Active state is directory-wide.** The active badge and the toggle now follow the directory
  (a directory is active when any of its members is), matching what the list already showed.
  "Remove from active" therefore really stops the directory from auto-syncing, instead of
  silently leaving another member of the same directory active.

### Bug Fixes

- Fixed the info button's hover explanation never appearing on cards, and made it show
  instantly rather than relying on the browser's slow native tooltip.
- Removed an explanatory line on the directory detail page that only repeated the tooltip.

---
No migration needed: existing configuration keeps working, only the presentation changed.
