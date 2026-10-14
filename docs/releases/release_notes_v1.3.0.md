# Release v1.3.0 — Import third-party skill repositories straight from a Git URL

> Release date: 2026-10-14

## Overview

This is a minor release. It adds a one-click **Import from Git** entry point for third-party repositories: paste a Git URL (`https://` / `ssh://` / `git://` / `file://` / `user@host:path`), Flint clones the repository into its own managed directory and hands it straight to the existing registration flow. Imported sources stay read-only, and updates keep working through the usual **Check updates** / **Sync** actions.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

- **Library ▸ Repositories** now has two toolbar actions: **Import from Git** and **Register repository**.
- Click **Import from Git**, paste a Git URL, and hit **Pull**. The code is cloned into `<flint data dir>/sources/<repo-name>`, then the registration dialog opens on its own with the **Third-party repository** type selected and the path already filled in — confirm the layout, preview, and register as usual.
- A repeat import reuses the existing clone (it fetches instead of re-downloading). Private repositories without cached credentials fail in seconds instead of hanging on a credential prompt.
- After registration the source behaves like any other third-party repository: read-only, with **Check updates** / **Sync** available (the remote is read from `git remote`, so nothing extra is stored in your config).

## What's New

### Features & Improvements

- **Import third-party repositories from a Git URL** — a dedicated entry point next to *Register repository*, with support for `https://`, `ssh://`, `git://`, `file://`, and the `user@host:path` shorthand. URLs that try to inject Git options or use `ext::`-style remote helpers are rejected.
- **Clone once, reuse after** — code lands in Flint's managed `<flint data dir>/sources/<repo-name>` directory; importing the same URL again reuses the existing clone and fetches, so you never download twice.
- **Hands off to the existing registration flow** — the normal registration dialog (type, id, layout, preview, confirm) is reused, so an imported repository is registered and diagnosed exactly like a locally-pointed one; the default id comes from the repository name.
- **Async, time-bounded Git** — cloning runs in the background with a timeout and process-group cleanup (the UI never freezes), and interactive credential prompts are disabled so an unreachable private repo fails quickly instead of hanging.

---

### Notes

- Importing writes only to Flint's managed sources directory — the clone step never changes your config, and pulling without completing registration leaves nothing registered (the local clone is simply reused next time).
