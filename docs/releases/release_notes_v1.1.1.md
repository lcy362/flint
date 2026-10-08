# Release v1.1.1 — Remove any skill from a directory, preview before registering

> Release date: 2026-10-08

## Overview

v1.1.1 is a **patch release** that makes deleting a skill do what the button says, and rounds out
the registration path. Deleting a skill from an agent or project directory no longer refuses
external symlinks and agent-owned directories: a symlink is unlinked (its target is never touched),
while a real directory or file is removed — with a confirmation first. Registering a repository or
third-party source now previews what will be picked up before anything is saved, and a
single-skill repository whose root holds a `SKILL.md` is recognised as one skill instead of being
silently dropped.

## Usage

```bash
npm install -g flint-skills-hub   # update an existing install
flint -v                           # check the version in use
flint                              # start in the background, open the browser
```

No migration needed: existing configuration, repositories and skill directories keep working. See
the note at the end for the one behaviour change in this release.

## What's New

### Features & Improvements

- **Preview before registering a repository or source.** Registering is now two steps: fill in the
  form, press **Preview**, and the dialog reports what was actually found — the resolved layout,
  the skill count, the skill list, the id derived from the directory name, and any problem with it.
  Nothing is written until you confirm, and any edit to the form invalidates the preview so you
  are never confirming a stale scan. Leaving the id empty uses the directory name; when that name
  cannot produce a valid id, the id field is required and **Confirm** stays disabled until you type
  one. Editing an existing repository stays single-step.
- **Id rules are enforced for real.** Ids are validated on the server for both own repositories and
  third-party sources (letters, digits and `. _ -` only, starting with a letter or digit), and a
  duplicate id is rejected instead of silently overwriting. Previously the check only existed in
  the browser.
- **Single-skill repositories are recognised.** When the scan root itself contains a `SKILL.md` —
  a repository that *is* one skill — the whole directory is treated as a single skill, and its
  `skills/` subdirectories count as that skill's internals rather than separate skills. This
  applies uniformly to repository and third-party source scanning, layout detection and importing.
  Previously such a root was misdetected as nested and its own skill never showed up.

### Bug Fixes

- **Deleting a skill no longer fails on entries this tool did not deploy.** The delete action on an
  agent's skill directory, on a project's `.agents/skills`, and the switch in **Distribute to
  agents** all now remove the entry that is actually there: a symlink is unlinked only — the file
  it points at is never modified — and a real directory or file is deleted. Previously symlinks
  pointing outside this tool's own libraries, and agent-owned real directories, were refused with
  an error, so the Delete button could not succeed and the distribution switch was greyed out for
  those rows. Those restrictions are gone, and every removal asks for confirmation describing what
  will happen.
- **The action list no longer offers impossible actions.** Rows that are listed but not on disk
  (a project skill matched by a tag that has not been copied into `.agents/skills` yet) used to
  show a Delete button that could only fail; they now offer no actions.

---

## Upgrade note

Deleting a skill now removes whatever is in that directory. **A symlink is always safe** — only the
link goes away, the skill body it points at stays where it is — but deleting an agent-owned **real
directory deletes your files**, exactly as the confirmation dialog says. Removing a symlink that
another tool created is therefore fine; removing a real directory is a real deletion, so read the
dialog before confirming.
