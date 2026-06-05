---
name: agent-monitor
description: Install, configure, or troubleshoot AgentMonitor passive observability for Codex sessions.
---

# AgentMonitor

Use this skill when the user asks to enable, configure, inspect, or troubleshoot
AgentMonitor for Codex. AgentMonitor is a passive observability system: it should
record lifecycle events without taking control of the agent session.

## Install Or Update The Codex Hook

Run the installer from this skill's script directory:

```bash
bash scripts/install-codex-hook.sh
```

To override the default local server URL:

```bash
bash scripts/install-codex-hook.sh http://127.0.0.1:8766
```

The installer writes hook entries to `$CODEX_HOME/hooks.json` when `CODEX_HOME`
is set, otherwise to `~/.codex/hooks.json`. It stores editable connection
settings in `scripts/settings.json` next to the hook script.

## Configure

Edit `scripts/settings.json` when the server URL or token needs to change:

```json
{
  "server_url": "http://127.0.0.1:8766",
  "token": ""
}
```

Prefer this settings file over embedding secrets or URLs in hook commands.

The Codex hook also reads local Codex state files to attach `session_name` and
`session_pin` to each AgentMonitor event. `session_name` comes from the local
thread title, and `session_pin` comes from Codex's pinned-thread state.

## Verify

After installation:

1. Inspect the Codex hook list with `/hooks` in the CLI, or read
   `$CODEX_HOME/hooks.json` / `~/.codex/hooks.json`.
2. Confirm AgentMonitor server is reachable at the configured `server_url`.
3. Start a fresh Codex thread and check the AgentMonitor dashboard for a new
   `codex-hook` session.

Do not mock hook events unless the user explicitly asks for a synthetic test.
