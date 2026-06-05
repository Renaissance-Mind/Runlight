#!/bin/bash
# ============================================================
# Install AgentMonitor hook into Codex
# Usage: ./install.sh [server_url]
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/agent-monitor-hook.sh"
CODEX_HOOKS_JSON="${HOME}/.codex/hooks.json"
SERVER_URL="${1:-http://127.0.0.1:8766}"

if [ ! -f "$CODEX_HOOKS_JSON" ]; then
  echo "Error: ${CODEX_HOOKS_JSON} not found. Is Codex installed?"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required"
  exit 1
fi

echo "Installing AgentMonitor hook for Codex..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="AGENT_MONITOR_SERVER_URL=${SERVER_URL} bash ${HOOK_SCRIPT}"

add_hook() {
  local event="$1"
  local matcher="${2:-}"
  local timeout="${3:-5000}"

  local hook_entry
  if [ -n "$matcher" ]; then
    hook_entry=$(jq -n \
      --arg m "$matcher" \
      --arg cmd "$HOOK_CMD" \
      --argjson t "$timeout" \
      '{matcher: $m, hooks: [{type: "command", command: $cmd, timeout_ms: $t}]}')
  else
    hook_entry=$(jq -n \
      --arg cmd "$HOOK_CMD" \
      --argjson t "$timeout" \
      '{hooks: [{type: "command", command: $cmd, timeout_ms: $t}]}')
  fi

  # Check if agent-monitor hook already exists for this event
  local existing
  existing=$(jq -r ".hooks.${event} // [] | .[] | .hooks[]?.command // empty" "$CODEX_HOOKS_JSON" 2>/dev/null)

  if echo "$existing" | grep -q "agent-monitor-hook.sh"; then
    echo "  [skip] ${event}: already installed"
    return
  fi

  # Append to the event's hook array
  local tmp
  tmp=$(mktemp)
  jq ".hooks.${event} = (.hooks.${event} // []) + [${hook_entry}]" "$CODEX_HOOKS_JSON" > "$tmp"
  mv "$tmp" "$CODEX_HOOKS_JSON"
  echo "  [add]  ${event}"
}

# Register hooks for all Codex lifecycle events
add_hook "SessionStart" "" 5000
add_hook "PreToolUse" "Bash" 3000
add_hook "PreToolUse" "" 3000
add_hook "PostToolUse" "Bash" 3000
add_hook "PostToolUse" "" 3000
add_hook "PostToolUseFailure" "" 3000
add_hook "UserPromptSubmit" "" 3000
add_hook "Stop" "" 5000

echo ""
echo "Done. AgentMonitor will receive events from Codex sessions."
echo "Make sure the server is running at ${SERVER_URL}"
