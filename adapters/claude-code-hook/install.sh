#!/bin/bash
# ============================================================
# Install Runlight hook into Claude Code
# Usage: ./install.sh [server_url]
#
# Configuration lives in settings.json next to the hook script.
# Edit settings.json to change server_url or token at any time.
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/runlight-hook.sh"
SETTINGS_FILE="${SCRIPT_DIR}/settings.json"
CLAUDE_SETTINGS="${CLAUDE_SETTINGS_FILE:-${HOME}/.claude/settings.json}"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
  mkdir -p "$(dirname "$CLAUDE_SETTINGS")"
  echo '{}' > "$CLAUDE_SETTINGS"
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
echo "Installing Runlight hook for Claude Code..."
echo "  Hook script: ${HOOK_SCRIPT}"
echo "  Settings:    ${SETTINGS_FILE}"
echo "  Server URL:  ${SERVER_URL}"

HOOK_CMD="bash ${HOOK_SCRIPT}"

EVENTS=("SessionStart" "PreToolUse" "PostToolUse" "PostToolUseFailure" "PermissionRequest" "UserPromptSubmit" "SubagentStart" "SubagentStop" "SessionEnd" "Stop")

for event in "${EVENTS[@]}"; do
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
              | map(select((.command // "" | test("runlight-hook.sh|agent-monitor-hook.sh")) | not))
            )
          )
        | map(select((.hooks | length) > 0))
      )
    end
  ' "$CLAUDE_SETTINGS" > "$tmp"
  mv "$tmp" "$CLAUDE_SETTINGS"

  existing=$(jq -r ".hooks.${event} // [] | .[].hooks[]?.command // empty" "$CLAUDE_SETTINGS" 2>/dev/null)

  if echo "$existing" | grep -Eq "runlight-hook.sh|agent-monitor-hook.sh"; then
    echo "  [skip] ${event}: already installed"
    continue
  fi

  tmp=$(mktemp)
  jq ".hooks.${event} = (.hooks.${event} // []) + [{hooks: [{type: \"command\", command: $(printf '%s' "$HOOK_CMD" | jq -Rs .), timeout: 5, async: true}]}]" "$CLAUDE_SETTINGS" > "$tmp"
  mv "$tmp" "$CLAUDE_SETTINGS"
  echo "  [add]  ${event}"
done

echo ""
echo "Done. To change server URL or token, edit: ${SETTINGS_FILE}"
