# Release v1.5.0 — Install third-party skills from an npx command

> Release date: 2026-11-02

## Overview

This is a minor release. Flint now speaks **npx**: any third-party skill collection that can be installed with an npm command can be imported straight from that command. You paste the command you would actually run — `npx impeccable skills install` — and Flint takes care of the rest: parsing it, running it safely, detecting what landed and letting you register the result as a normal Flint source, updatable in place later.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

Import a third-party skill collection from an npm command:

1. Open **Library ▸ Repositories** and press **Import from npx command**.
2. Paste the command exactly as you would run it — `npx impeccable skills install`, with any flags you normally use. Flint parses the package name and the arguments for you (`npx` prefix and `--yes` are optional), and shows the exact command it is about to run.
3. Press **Install**. The command runs inside a Flint-managed directory (`~/.flint/sources/<id>`) that is initialised as a git repository, so every install is a snapshot you can diff or roll back. The installer's output is streamed back while it runs.
4. When it finishes, Flint detects the skill scan root and opens the registration dialog with the layout, the recognized skills and the id already filled in. Press **Confirm registration** to store it.

Afterwards the source card offers **Update**, which re-runs the same command in place.

## What's New

### Features & Improvements

- **Import third-party skills from an npx command** — one text field, one raw command. Flint extracts the package and the arguments, runs `npx --yes <pkg> <args>` in a managed directory with a non-interactive environment and a timeout, then infers the skill scan root from the result and continues into the regular registration flow. The installer information is stored with the source, which is what enables the one-click **Update** later.
- **The command is parsed for you** — quoted arguments are handled correctly, the `npx` prefix and `--yes` are optional, and Flint shows the normalized command before it starts, so there is no guesswork about what will run.
- **The install is isolated and reproducible** — the command runs in a managed directory that is a git repository, so each install leaves a snapshot that can be diffed or rolled back.

### Bug Fixes

- **An import that finds nothing can no longer be registered** — registering a source that scans to zero skills is blocked during the import flows, so you cannot end up with a permanently empty library entry. Manual registration stays untouched: that is an explicit choice and is still allowed.
- **The registration id is prefilled with the package name** instead of the directory name, which used to suggest `skills`.
- **Writes outside the managed directory are reported** — an installer that writes into your real agent directories (for example `~/.claude/agents`) is now surfaced in the registration dialog, with the exact paths. Flint still never deletes them on its own; they are yours to remove or to adopt with *Collect & take over*.
- **Long installs no longer die too early** — the timeout was raised to 10 minutes and a 5-minute "no output" watchdog was added, so an installer that hangs is stopped with a clear reason instead of a generic failure.
- **Failed imports leave no half-finished state** in a freshly created managed directory, and the UI reports *failed* instead of *done*.
- **A dropped connection no longer freezes the dialog** — if the stream dies (server restart, network hiccup), the operation is interrupted and reported rather than spinning forever.

---

### Notes

- The managed directory constrains the *working directory* of the installer, not its home directory: an installer that probes `~` can still write into your real agent directories. Flint reports these writes honestly (paths listed in the registration dialog) but does not remove them — that stays a deliberate boundary, since Flint only cleans up what it owns.
- A first-time install of a large collection can take several minutes, because the installer sets the skills up for every agent it detects.
- Known limitations of the current flow are tracked in `docs/TECH.md` (§15, *Known issues*).
