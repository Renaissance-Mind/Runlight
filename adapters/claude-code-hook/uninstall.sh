#!/bin/bash
# Remove Runlight hooks from Claude Code settings.json
set -e

CLAUDE_SETTINGS="${CLAUDE_SETTINGS_FILE:-${HOME}/.claude/settings.json}"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo "No settings.json found"
  exit 0
fi

echo "Removing Runlight hooks from Claude Code..."

tmp=$(mktemp)
jq '
  .hooks |= with_entries(
    .value |= map(
      select(.hooks | all(.command | test("runlight-hook.sh|agent-monitor-hook.sh") | not))
    )
  )
' "$CLAUDE_SETTINGS" > "$tmp" && mv "$tmp" "$CLAUDE_SETTINGS"

echo "Done."
