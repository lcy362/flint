# Release v1.1.0 — Flint starts in the background, like `start.sh`

> Release date: 2026-09-28

## Overview

v1.1.0 is a **minor release** that changes how the `flint` command behaves: it now starts the
server in the background and returns as soon as the server answers, instead of holding your
terminal as a foreground process. The startup model matches `./start.sh` from a source checkout,
so both entry points behave the same way: background server, logs on disk, browser opened once
ready, shell prompt back.

## Usage

```bash
npm install -g flint-skills-hub   # update an existing install
flint -v                           # check the version in use
flint                              # start in the background, open the browser, exit
```

Stopping and restarting the background instance:

```bash
kill <PID>      # PID is printed at startup (also stored in ~/.flint/logs/flint.pid)
flint -y        # force restart: stop the running instance, then start fresh
flint -f        # run in the foreground instead (debugging, containers)
flint -p 9000   # custom port
flint --no-open # start without opening the browser
```

Running `flint` while an instance is already up re-opens the page rather than starting a second
one. A port held by another program is reported and left alone — Flint never kills processes it
does not own.

## What's New

### Features & Improvements

- **The command no longer occupies your terminal.** `flint` spawns the server as a detached
  process, waits until it answers, opens the browser and exits; the server keeps running in the
  background. Startup prints the URL, the process PID, the log paths and the `kill` command you
  need to stop it again.
- **Startup logs go to disk.** Console output stays short (banner, URL, PID, logs, stop hint)
  while the server's own output is written to `~/.flint/logs/flint.log`; the application log
  remains `~/.flint/logs/app.log`. `FLINT_LOGS` overrides the directory.
- **Running it twice no longer fails with "port in use".** The command recognises an existing
  Flint instance — by its PID file and process command line — and simply re-opens the page. A
  process that holds the port but no longer answers is reported as stale, with a hint to restart
  with `-y`.
- **Ports held by other programs are never killed.** Other occupants are reported with their PID
  and Flint exits; only the explicit force-restart flag (`-y` / `-r`) restarts a Flint instance.
- **`--foreground` for debugging and containers.** `-f` keeps the old behaviour — server in the
  same process, logs on the console, `Ctrl+C` stops it — which is what container entry points and
  troubleshooting sessions want.
- **Node.js version check at startup**, matching the `>= 20` requirement the package declares.

---
No migration needed: existing configuration, repositories and skill directories keep working. If
you scripted around the old foreground behaviour (for example in Docker), add `-f`.
