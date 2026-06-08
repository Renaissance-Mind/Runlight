#!/bin/bash
# ============================================================
# Install AgentMonitor hook into Codex
# Usage: ./install.sh [server_url]
#
# Configuration lives in settings.json next to the hook script.
# Edit settings.json to change server_url or token at any time.
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/agent-monitor-hook.sh"
SETTINGS_FILE="${SCRIPT_DIR}/settings.json"
CODEX_HOME_DIR="${CODEX_HOME:-${HOME}/.codex}"
CODEX_HOOKS_JSON="${CODEX_HOME_DIR}/hooks.json"

mkdir -p "$CODEX_HOME_DIR"
if [ ! -f "$CODEX_HOOKS_JSON" ]; then
  jq -n '{hooks: {}}' > "$CODEX_HOOKS_JSON"
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
echo "Installing AgentMonitor hook for Codex..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Settings:    ${SETTINGS_FILE}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="bash ${HOOK_SCRIPT}"

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

  local existing
  existing=$(jq -r ".hooks.${event} // [] | .[] | .hooks[]?.command // empty" "$CODEX_HOOKS_JSON" 2>/dev/null)

  if echo "$existing" | grep -q "agent-monitor-hook.sh"; then
    echo "  [skip] ${event}: already installed"
    return
  fi

  local tmp
  tmp=$(mktemp)
  jq ".hooks.${event} = (.hooks.${event} // []) + [${hook_entry}]" "$CODEX_HOOKS_JSON" > "$tmp"
  mv "$tmp" "$CODEX_HOOKS_JSON"
  echo "  [add]  ${event}"
}

add_hook "SessionStart" "" 5000
add_hook "PreToolUse" "" 3000
add_hook "PostToolUse" "" 3000
add_hook "PostToolUseFailure" "" 3000
add_hook "UserPromptSubmit" "" 3000
add_hook "Stop" "" 5000

echo ""
echo "Done. To change server URL or token, edit: ${SETTINGS_FILE}"
