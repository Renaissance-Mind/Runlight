#!/bin/bash
# Remove AgentMonitor hooks from Codex hooks.json
set -e

CODEX_HOOKS_JSON="${HOME}/.codex/hooks.json"

if [ ! -f "$CODEX_HOOKS_JSON" ]; then
  echo "No hooks.json found"
  exit 0
fi

echo "Removing AgentMonitor hooks from Codex..."

tmp=$(mktemp)
jq '
  .hooks |= with_entries(
    .value |= map(
      select(.hooks | all(.command | test("agent-monitor-hook.sh") | not))
    ) | select(length > 0)
  )
' "$CODEX_HOOKS_JSON" > "$tmp" && mv "$tmp" "$CODEX_HOOKS_JSON"

echo "Done."
