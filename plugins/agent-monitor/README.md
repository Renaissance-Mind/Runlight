# AgentMonitor Codex Plugin

This package installs the AgentMonitor Codex integration workflow. The plugin
does not declare a Codex MCP server yet; the current integration records events
through Codex lifecycle hooks.

Each Codex event includes `session_name` from the local Codex thread title and
`session_pin` from the local Codex pinned-thread state when those files are
available.

Install from the repo marketplace:

```bash
codex plugin marketplace add /Users/caopu/workspace/AgentMonitor
codex plugin add agent-monitor@agent-monitor-local
```

Start a new Codex thread after installation so the bundled skill is loaded.

Then run the bundled installer from the installed skill to write lifecycle hooks
into `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json`:

```bash
bash ~/.codex/plugins/cache/agent-monitor-local/agent-monitor/0.1.0/skills/agent-monitor/scripts/install-codex-hook.sh
```

Plugin installation makes the AgentMonitor skill available; hook installation is
the step that starts event collection.
