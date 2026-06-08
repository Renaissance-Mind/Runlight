# AgentMonitor Claude Code Plugin

Records Claude Code lifecycle events (session start/end, tool use, prompts)
and sends them to the AgentMonitor server for observability.

## Install

```bash
# Register hooks into ~/.claude/settings.json
bash install.sh --server http://127.0.0.1:8766

# Restart Claude Code for hooks to take effect
```

## Uninstall

```bash
bash install.sh --uninstall
```

## Why keep a manual install step?

The plugin manifest declares the hook inventory for clients that support plugin
hook metadata. The install script remains the reliable path for local use: it
writes hooks directly into `~/.claude/settings.json`, stores server/token options
under `pluginConfigs`, and marks hook calls async so monitoring cannot block
Claude Code.
