---
name: runlight
description: Configure or troubleshoot Runlight passive observability for Claude Code sessions.
---

# Runlight

Use this skill when the user asks about Runlight integration for Claude Code.
Runlight is daemon-first: Claude hooks call `runlight hook claude`, the local
daemon maps raw hook payloads into Runlight protocol events, queues them, and
uploads to the configured Runlight server.

## Configure

Preferred user path:

```bash
npm install -g runlight
runlight onboarding
```

Claude-only hook installation:

```bash
runlight plugin claude
```

Do not put the hosted server URL or upload token in Claude hook commands. Use:

```bash
runlight login
runlight setting
runlight status
runlight health
```

Local settings live in `~/.runlight/config.json` unless `RUNLIGHT_HOME` is set.

## Verify

1. Run `runlight status`.
2. Run `/plugin details runlight@runlight-local` to inspect bundled hook
   metadata if the plugin was installed through Claude's plugin system.
3. Run `/reload-plugins` after changing plugin state.
4. Start a fresh Claude Code session and check the Runlight dashboard for a
   `claude-code-hook` session.

Do not mock hook events unless the user explicitly asks for a synthetic test.
