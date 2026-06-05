#!/bin/bash
# ============================================================
# Install AgentMonitor hook into Claude Code
# Usage: ./install.sh [server_url]
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/agent-monitor-hook.sh"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
SERVER_URL="${1:-http://127.0.0.1:8766}"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo "Error: ${CLAUDE_SETTINGS} not found. Is Claude Code installed?"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required"
  exit 1
fi

chmod +x "$HOOK_SCRIPT"

echo "Installing AgentMonitor hook for Claude Code..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="AGENT_MONITOR_SERVER_URL=${SERVER_URL} bash ${HOOK_SCRIPT}"

EVENTS=("SessionStart" "PreToolUse" "PostToolUse" "PostToolUseFailure" "PermissionRequest" "UserPromptSubmit" "SubagentStart" "SubagentStop" "SessionEnd" "Stop")

for event in "${EVENTS[@]}"; do
  existing=$(jq -r ".hooks.${event} // [] | .[].hooks[]?.command // empty" "$CLAUDE_SETTINGS" 2>/dev/null)

  if echo "$existing" | grep -q "agent-monitor-hook.sh"; then
    echo "  [skip] ${event}: already installed"
    continue
  fi

  tmp=$(mktemp)
  jq ".hooks.${event} = (.hooks.${event} // []) + [{hooks: [{type: \"command\", command: $(printf '%s' "$HOOK_CMD" | jq -Rs .), timeout: 5}]}]" "$CLAUDE_SETTINGS" > "$tmp"
  mv "$tmp" "$CLAUDE_SETTINGS"
  echo "  [add]  ${event}"
done

echo ""
echo "Done. AgentMonitor will receive events from Claude Code sessions."
echo "Make sure the server is running at ${SERVER_URL}"
