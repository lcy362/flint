# Release v1.2.0 — Skill content health: security scan and frontmatter validation

> Release date: 2026-10-09

## Overview

This is a minor release. It adds **content health checks** for your own-repository skills: a read-only **security scan** (dangerous callbacks, leaked credentials, prompt injection, obfuscation payloads) and **SKILL.md frontmatter validation** (missing `name` / `description`, `name` differing from the directory name). Findings surface in three places — the health center, the skill list, and the skill detail page.

## Usage

No migration needed — install or update as before:

```bash
npx flint-skills-hub
# or
npm i -g flint-skills-hub
```

- **Health** shows a new **Content** dimension: each item lists the rule, the file and the line.
- **Library** marks skills with detected issues using a **risk badge** (red when any error is present, amber otherwise).
- A skill's detail page gains a collapsible **Content check** section (collapsed by default) that runs on demand, can be re-run, and shows the excerpt of each matched line for review.

All checks are read-only, run entirely on your machine, and never touch third-party read-only sources — no network access at runtime.

## What's New

### Features & Improvements

- **Content security scan** — own-repository skills are scanned for remote-code-execution patterns (`curl | sh`, `eval`, `child_process`, …), leaked credentials (OpenAI / Anthropic / AWS / GitHub / Slack / Stripe / Google / npm tokens, private key blocks), prompt-injection phrasing, and obfuscation payloads (zero-width and bidi characters, long base64 blobs).
- **Frontmatter validation** — flags broken YAML, missing `name` / `description`, a `name` that differs from the directory name, and non-slug names: exactly the mismatches that silently make an agent fail to load a skill.
- **Health center: a consolidated `content` dimension** — one read-only view reporting every finding with `ok` / `warn` / `error` per item.
- **Skill list: risk badge** — a skill with issues is marked at a glance, so you can spot problems without opening the health center.
- **Skill detail: on-demand content check** — a collapsible section (collapsed by default) with a **Re-check** button; each finding shows its rule, `file:line`, and the excerpt of the matched line.
- **Low false positives by design** — placeholder values (`sk-xxxx`, `your-api-key`) and low-entropy assignments are dropped, and illustrative mentions ("never use …") are demoted by one severity level.
- **Detection rules are data, not code** — rules live in a vendored YAML snapshot (`server/rules/security/*.yaml`) compiled into a TypeScript constant table at build time (`npm run gen:security-rules`). No new runtime dependency, and the compiled table ships with the package.
