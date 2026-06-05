#!/bin/bash
# ============================================================
# Install AgentMonitor hook into Claude Code
# Usage: ./install.sh [server_url]
#
# Configuration lives in settings.json next to the hook script.
# Edit settings.json to change server_url or token at any time.
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/agent-monitor-hook.sh"
SETTINGS_FILE="${SCRIPT_DIR}/settings.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
  echo "Error: ${CLAUDE_SETTINGS} not found. Is Claude Code installed?"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required"
  exit 1
fi

# Seed settings.json on first install, then let an explicit argument update
# only the server_url field.
if [ ! -f "$SETTINGS_FILE" ]; then
  jq -n \
    --arg url "${1:-http://127.0.0.1:8766}" \
    '{server_url: $url, token: ""}' > "$SETTINGS_FILE"
elif [ -n "${1:-}" ]; then
  tmp=$(mktemp)
  jq --arg url "$1" '.server_url = $url' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
fi

chmod +x "$HOOK_SCRIPT"

SERVER_URL="$(jq -r '.server_url' "$SETTINGS_FILE" 2>/dev/null)"
echo "Installing AgentMonitor hook for Claude Code..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Settings:    ${SETTINGS_FILE}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="bash ${HOOK_SCRIPT}"

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
echo "Done. To change server URL or token, edit: ${SETTINGS_FILE}"
