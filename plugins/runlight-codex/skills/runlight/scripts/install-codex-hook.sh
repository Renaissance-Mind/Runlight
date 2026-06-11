#!/bin/bash
# Install Runlight hook entries for Codex from the packaged plugin skill.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/runlight-hook.sh"
SETTINGS_FILE="${SCRIPT_DIR}/settings.json"
CODEX_HOME_DIR="${CODEX_HOME:-${HOME}/.codex}"
CODEX_HOOKS_JSON="${CODEX_HOME_DIR}/hooks.json"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required"
  exit 1
fi

mkdir -p "$CODEX_HOME_DIR"
if [ ! -f "$CODEX_HOOKS_JSON" ]; then
  jq -n '{hooks: {}}' > "$CODEX_HOOKS_JSON"
fi

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
echo "Installing Runlight hook for Codex..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Settings:    ${SETTINGS_FILE}"
echo "  Hooks file:  ${CODEX_HOOKS_JSON}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="bash ${HOOK_SCRIPT}"

prune_runlight_hook() {
  local event="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg event "$event" '
    if (.hooks[$event] // null) == null then
      .
    else
      .hooks[$event] = (
        .hooks[$event]
        | map(
            .hooks = (
              .hooks
              | map(
                  select(
                    (.command // "" | test("skills/runlight/scripts/runlight-hook.sh|skills/agent-monitor/scripts/agent-monitor-hook.sh|agent-monitor-hook.sh"))
                    | not
                  )
                )
            )
          )
        | map(select((.hooks | length) > 0))
      )
    end
  ' "$CODEX_HOOKS_JSON" > "$tmp"
  mv "$tmp" "$CODEX_HOOKS_JSON"
}

add_hook() {
  local event="$1"
  local matcher="${2:-}"
  local timeout="${3:-5000}"

  prune_runlight_hook "$event"

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

  if echo "$existing" | grep -q "$HOOK_SCRIPT"; then
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
