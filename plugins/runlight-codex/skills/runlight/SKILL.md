---
name: runlight
description: Install, configure, or troubleshoot Runlight passive observability for Codex sessions.
---

# Runlight

Use this skill when the user asks to enable, configure, inspect, or troubleshoot
Runlight for Codex. Runlight is passive observability: it records lifecycle
events without taking control of the agent session.

## Activation Model

Runlight is daemon-first. Codex hooks must not upload directly to the hosted
server. The hook command is `runlight hook codex`, which sends the raw hook
payload to the local daemon. The daemon owns protocol mapping, token storage,
queueing, retry, local metadata enrichment, and upload.

The Codex plugin installation makes this skill and its packaged scripts
available inside Codex. It does not automatically register lifecycle hooks or
write global Codex configuration.

## Install Or Update

Preferred user path:

```bash
npm install -g runlight
runlight onboarding
```

Codex-only hook installation:

```bash
runlight plugin codex
```

If the user is inside the packaged skill script directory and explicitly wants
the bundled installer:

```bash
bash scripts/install-codex-hook.sh
```

The installer writes hook entries to `$CODEX_HOME/hooks.json` when `CODEX_HOME`
is set, otherwise to `~/.codex/hooks.json`. The hook command should be
`runlight hook codex` or a source-checkout equivalent such as
`node /path/to/Runlight/bin/runlight.js hook codex`.

## Configure

Use the local CLI, not hook command arguments:

```bash
runlight login
runlight setting
runlight status
runlight health
```

Local settings live in `~/.runlight/config.json` unless `RUNLIGHT_HOME` is set.
The upload token comes from the hosted dashboard Settings page.

The local daemon also reads Codex state files when available to attach
`session_name` and `session_pin` to each Runlight event.

## Verify

After hook installation:

1. Run `runlight status`.
2. Inspect the Codex hook list with `/hooks`, or read `$CODEX_HOME/hooks.json` /
   `~/.codex/hooks.json`.
3. Confirm the daemon is running and the queue is not blocked by a missing token.
4. Start a fresh Codex thread and check the Runlight dashboard for a new
   `codex-hook` session.

Do not mock hook events unless the user explicitly asks for a synthetic test.
