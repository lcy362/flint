# Release v1.0.0 — First stable release of the local-first AI skills manager

> Release date: 2026-09-15

## Overview

v1.0.0 is the first **stable** release of Flint (`flint-skills-hub`) — a local-first personal AI
**skills** asset manager. AI coding agents each keep their own skill directory, so the skills you write
end up scattered across a dozen tools that cannot see each other. Flint gathers them into one library,
deduplicates and tags them, and distributes them back into agent and project directories on demand,
from a single local web UI. Everything stays plain files on your disk — no proprietary database, no
account, no cloud — so the asset remains yours and keeps working if you move to another tool.

Because this is the first stable release, the sections below list the complete feature set rather than
a changelog.

## Usage

Requires Node.js ≥ 20. Install globally, or run it straight away without installing:

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

The server refuses to start if the port is already taken and tells you how to pick another one.
Configuration lives in `~/.skills-hub/config.json`; logs in `~/.skills-hub/logs/app.log`.

From source instead of npm:

```bash
git clone https://github.com/lcy362/flint.git && cd flint
npm install && npm run build && ./start.sh
```

## Features

### Skill library

- **One place for every skill.** Browse, search and filter all skills across your repositories and
  third-party sources — by source, by tag, or "untagged only", with multi-select filters combined as
  OR. Skill detail shows the `SKILL.md` preview, tag editing and where the skill came from.
- **Own repositories.** Register any number of non-hidden directories you own as the source of truth;
  each has an id that becomes part of the global skill identity `name@source`. Own repositories are
  flat by design (`<root>/<name>/SKILL.md`), so what Flint reads and what it writes are always the
  same location. The directory stays fully usable with git or any editor.
- **Third-party repositories.** Register upstream libraries as read-only sources: flat, nested
  category trees, or libraries that ship an index manifest. Their skills are discovered and usable,
  never modified.
- **Repositories are ordinary folders.** Register, edit, delete, and switch a repository between
  "own" and "third-party" without breaking skill references; the scan root is always stated in the UI.

### Agents

- **59 built-in agents** plus any custom agent you add (name + global directory, optional project
  directory), covering coding tools and personal-assistant agents alike.
- **One card per real skill directory.** Agents that resolve to the same directory merge into a single
  card and share a single strategy (a directory can only hold one truth), with a designated primary
  agent holding it; the UI states this explicitly instead of showing several contradictory settings.
- **Active set.** Skills are projected into the directories of the agents you mark active — as a
  symlink by default, or as a copy — immediately at the moment a decision changes. There is no
  background daemon doing full scans.
- **Inactive agents are never touched silently.** Any manual action on their detail page reconciles
  on the spot, or press **Sync** to run a full reconciliation.
- **Per-agent and per-skill install mode** (symlink / copy). Copy mode can additionally be watched for
  incremental sync — off by default.
- **Skill rows tell the truth.** Every row shows where the skill physically lives and, for symlinks,
  where the link actually points; provenance is derived from the link target rather than guessed from a
  same-named skill elsewhere. Rows also distinguish self-owned skills, links created by other tools and
  skills read from a shared standard directory (`~/.agents/skills`, `~/.config/agents/skills`).
- **Row status is simply enabled / disabled** — is the skill present and usable here — while actions
  only appear when they can actually do something (see collect and takeover below).

### Presets

- A preset is a named bundle: explicit members ∪ everything matching its linked tags. There is no
  separate enable switch, because the preset *is* the decision — change its members or tags and active
  agents pick the change up immediately.
- Presets are delivered only to the agents that link them; no link means no follow, and presets are
  never applied globally. Tags that pull a skill in keep its toggle locked, so removing the tag is the
  way to disable it.

### Projects

- Register a project path with tags and the desired skill set derives itself (`tags ∪ explicit-on −
  explicit-off`), with no file layout mixed into the decision.
- Skill bodies are **copied** into `<project>/.agents/skills` so they can be committed and shared with
  a team, then linked into each agent's project directory — one body, many agents.
- The sync keeps an `INDEX.md` listing as a plain artifact and only ever removes copies it deployed
  itself, so hand-written project skills are never deleted.
- Push edits made in a project back to a repository, collect or take over project skills, and delete
  real project directories when you really mean to.

### Collect, take over & import

- **Collect from agents or projects** into a repository, with a two-step confirmation that shows every
  write path before executing; same-named skills are deduplicated, or arbitrated by you (keep the
  repository copy, or overwrite it with a specific agent's version).
- **Take over** replaces an agent's entry with a symlink to the repository copy so only one body
  exists; in projects it writes a real copy instead, because `.agents` has to stay self-contained.
- **Import external directories** in bulk — flat, nested, or indexed catalog layouts — recording where
  each skill came from; source directories act as data sources and are not registered.
- The action only shows up where it can do something: a skill whose link already points inside one of
  your registered libraries has a home, so **Collect to repository** is not offered there — those rows
  keep **Remove** instead.

### Health

- A six-dimension checkup: sync drift, duplicate same-named skills, broken links, config loadability,
  repository sources and project paths — each reporting ok / warning / error.
- One-click fixes for every finding, each showing exactly what it will execute before you confirm.

### Settings

- **Interface language** — English or Chinese, applied to both the UI and messages returned by the
  server, remembered locally.
- Default install mode, the optional copy-mode watcher, custom agents, and log viewing / download /
  copy diagnostics.

### Safety, by design

- **Local-first.** Scanning, linking, copying and persistence all happen on your machine; nothing is
  sent anywhere, and no account or telemetry is involved.
- **Files are the only truth.** A skill is a `SKILL.md` directory; tags are written into frontmatter
  (or staged in config, migratable in one click). Decisions live in `~/.skills-hub/config.json`, and
  everything physical — what is deployed where — is read from the directories themselves.
- **Nothing you own gets deleted.** Flint only removes the links and copies it deployed itself; real
  directories, skills your agents ship with, links created by other tools and read-only sources are
  left untouched.
- **Idempotent and diff-driven.** Scanning, importing, collecting and syncing can be repeated safely,
  producing no duplicate bodies and no dangling links.
- **Failures are visible.** If a symlink cannot be created (for example on Windows without
  permission), Flint falls back to copying and reports a warning instead of failing silently.

---

**Upgrading:** no breaking changes and no migration are required. Your `~/.skills-hub/config.json`,
your repositories and your agents' skill directories are all untouched by this release; users coming
from the 0.1.x line need to do nothing.
