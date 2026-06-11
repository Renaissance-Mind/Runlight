#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CODEX_ADAPTER="$ROOT_DIR/adapters/codex-hook/runlight-hook.sh"
CODEX_PLUGIN="$ROOT_DIR/plugins/runlight-codex/skills/runlight/scripts/runlight-hook.sh"
CLAUDE_PLUGIN_JSON="$ROOT_DIR/plugins/runlight-claude/.claude-plugin/plugin.json"
CLAUDE_PLUGIN_HOOK="$ROOT_DIR/plugins/runlight-claude/scripts/runlight-hook.sh"
LOCAL_HOOK="$ROOT_DIR/src/local/hook.js"
CLAUDE_PLUGIN_HOOKS_JSON="$ROOT_DIR/plugins/runlight-claude/hooks/hooks.json"

grep -q 'runlight hook codex' "$CODEX_ADAPTER"
grep -q 'runlight hook codex' "$CODEX_PLUGIN"
grep -q 'runlight hook claude' "$CLAUDE_PLUGIN_HOOK"
grep -q 'buildCodexEvent' "$LOCAL_HOOK"
grep -q 'buildClaudeEvent' "$LOCAL_HOOK"
grep -q '/events' "$LOCAL_HOOK"
grep -q '"hooks": "./hooks/hooks.json"' "$CLAUDE_PLUGIN_JSON"
grep -q '"command": "runlight hook claude"' "$CLAUDE_PLUGIN_HOOKS_JSON"
! grep -R "curl .*api/events\\|RUNLIGHT_TOKEN=.*api/events\\|RUNLIGHT_SERVER_URL=.*api/events" \
  "$ROOT_DIR/adapters/codex-hook" \
  "$ROOT_DIR/adapters/claude-code-hook" \
  "$ROOT_DIR/plugins/runlight-codex/skills/runlight/scripts" \
  "$ROOT_DIR/plugins/runlight-claude/scripts"

echo "hook contracts ok"
