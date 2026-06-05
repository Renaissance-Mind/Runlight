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
