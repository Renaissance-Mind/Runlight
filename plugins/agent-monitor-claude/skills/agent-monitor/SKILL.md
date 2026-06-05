---
name: agent-monitor
description: Configure or troubleshoot AgentMonitor passive observability for Claude Code sessions.
---

# AgentMonitor

Use this skill when the user asks about AgentMonitor integration for Claude Code.
The plugin records lifecycle events passively through `hooks/hooks.json` and the
packaged `scripts/agent-monitor-hook.sh` script.

## Configure

The plugin prompts for:

- `server_url`: the AgentMonitor server endpoint, defaulting to
  `http://127.0.0.1:8766`
- `token`: optional bearer token for the AgentMonitor ingest API

Prefer plugin user configuration over hard-coding secrets in hook commands.

## Verify

1. Run `/plugin details agent-monitor@agent-monitor-local` to inspect the
   bundled hook inventory.
2. Run `/reload-plugins` after changing plugin state.
3. Start a fresh Claude Code session and check the AgentMonitor dashboard for a
   `claude-code-hook` session.

Do not mock hook events unless the user explicitly asks for a synthetic test.
