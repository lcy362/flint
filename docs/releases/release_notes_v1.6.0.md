# Release v1.6.0 — A rebuilt interface, with the shared directory in front

> Release date: 2026-11-04

## Overview

This is a medium release. The entire interface was rebuilt around a **flint** identity: a limestone ground, a basalt rail, one cinnabar accent that only marks primary actions and the active state, mineral-pigment status colors, drawn icons, and a hairline grid instead of stacked cards. Alongside the new look, the **ecosystem-recommended directory** (`~/.agents/skills`) now gets its own row at the top everywhere it appears, and two import bugs found in real runs are fixed.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

Nothing in `~/.flint/config.json` changed shape, and no files are moved. The first open follows your operating system's light/dark preference; a theme you pick yourself is remembered.

## What's New

### Features & Improvements

- **A complete visual rebuild.** Every screen now follows one system: stone-grey grounds, a dark basalt rail that carries the sense of place, a single cinnabar accent reserved for primary actions, active items and focus, and status colors taken from mineral pigments. Headings share one family with the body text and are ranked by weight and size; paths, counts and identifiers are set in tabular monospace so columns line up. Cards are raised plates with fixed label and action baselines, so a wall of 120 skills can be scanned by position instead of by reading.
- **Icons are drawn, not typed.** Navigation, toolbars, empty states and dialogs all use a single icon set with one stroke width. Text glyphs and emoji are gone, so nothing shifts when a font changes.
- **The ecosystem-recommended directory now leads.** `~/.agents/skills` is pinned to the first row in the Agents page, the *Distribute to agents* dialog and preset details. It spans the full width as a larger card, states that mainstream agents (Codex, DeepSeek Harness, OpenCode, WorkBuddy, Cursor, GitHub Copilot) read it, then a divider tells you to look below only when you need one specific agent's own directory. The per-agent name list no longer crowds the card face; the current members stay in the info tooltip and on the directory page.
- **Follow the system theme.** Light and dark are now picked from the OS on first open, with a pre-paint script so a dark desktop never flashes a white page. Only an explicit toggle is stored.
- **Clearer page structure.** A page title appears once, in the content area; the detail top bar carries a `Library / name@source` breadcrumb instead. Headings run `h1 → h2 → h3` without gaps, and list sections are no longer boxes drawn inside boxes.
- **Paths wrap where paths wrap.** Long skill paths break after `/` and never mid-word, without inserting characters into the path itself — copy and search still see the original string.
- **Keyboard and screen-reader fixes.** Focus rings are always visible (2px solid accent plus offset), dialogs trap focus and return it to the trigger when closed, and the info tooltip only mounts while open so it is announced rather than read as body text.
- **The rail collapses instead of vanishing.** Below 1080px it becomes an icon rail; below 760px a horizontal navigation strip that keeps the wordmark and active marker.

### Bug Fixes

- **Importing a collection that installs into several harnesses** now derives the scan root from one of the produced skills directories instead of falling back to the managed directory, where the flat scan found nothing and the import blocked itself on its own zero-skill check.
- **An absolute scan root is no longer mangled** during registration — it is used as-is instead of being joined onto a path.
- **Readability and overflow regressions from the previous skin**: secondary text and accent-on-tint labels now meet 4.5:1, the styled info tooltip no longer overflows its trigger, the missing `--c-bg-2` token is defined, and hover states are visible inside panels as well as outside them.

---

### Notes

- The visual rebuild changes no flow, no wording contract of existing actions, and no file on disk: skills are still deployed only by explicit actions, symlinks are still unlinked rather than followed, and nothing is re-synced behind your back.
- On first run after upgrading, the interface follows your OS appearance rather than staying on the light theme unconditionally.
- Known limitations remain tracked in `docs/TECH.md` (§15, *Known issues*).
