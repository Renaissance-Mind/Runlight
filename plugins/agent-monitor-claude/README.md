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

## Why a manual install step?

Claude Code's plugin system auto-loads **skills** but does not auto-register
**hooks** from `hooks.json`. Hooks must be written directly into
`~/.claude/settings.json`. The install script handles this merge.
