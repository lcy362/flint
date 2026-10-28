# Release v1.4.0 — Register a skill directory as a third-party library from the command line

> Release date: 2026-10-28

## Overview

This is a minor release. Any filesystem directory can now be handed to Flint straight from the terminal: `flint <directory>` (or `flint .` from inside it) opens the Web UI directly on the **register a third-party repository** dialog, with the path filled in and the detection preview already run — you only review and confirm. Nothing is written to your config until you press **Confirm registration**.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

Register a directory in one step:

```bash
# absolute or relative path, from anywhere
flint ~/skills/awesome-collection

# or from inside the directory itself
cd ~/skills/awesome-collection && flint .
```

- The browser opens on **Library ▸ Repositories** with the registration dialog already up: path and display name filled in, layout detected, and the recognized skills listed.
- Review the detection result and press **Confirm registration** — that is the only step that writes anything. Closing the dialog leaves your config untouched.
- Relative paths resolve against the current directory, `~` is expanded, and a path that is missing or is not a directory fails in the terminal with a clear message instead of opening a dead-end dialog.
- When a Flint instance is already running, the same command just deep-links into it instead of starting a second one; the page URL is printed even with `--no-open`, so headless / CI-style shells can be handed the link.

## What's New

### Features & Improvements

- **One-command third-party registration** — `flint <directory>` and `flint .` open the registration dialog in a *prefilled, pending-confirmation* state: path and name are already there and the layout / skill detection has already run. The CLI itself stays side-effect free: it validates the path and builds a link, never touching your config or the directory.
- **Path validation up front** — the directory is resolved to an absolute path (relative paths against the current working directory, `~` expanded, trailing separators normalized) and checked before anything opens, so a typo is reported in the terminal rather than as an empty preview.
- **Deep link is a one-shot intent** — the registration request is consumed once and removed from the address bar, so refreshing the page or dismissing the dialog does not pop it back up; the URL is printed for shells that cannot open a browser.

---

### Notes

- The registration dialog now runs the detection preview automatically whenever it is opened with a prefilled path — both for this command and for **Import from Git** — so you see the recognized layout, skill count and derived id without an extra click.
- Third-party libraries remain read-only: the directory itself is never modified, and nothing is registered unless you confirm.
