#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CODEX_ADAPTER="$ROOT_DIR/adapters/codex-hook/runlight-hook.sh"
CODEX_PLUGIN="$ROOT_DIR/plugins/runlight-codex/skills/runlight/scripts/runlight-hook.sh"
CLAUDE_PLUGIN_JSON="$ROOT_DIR/plugins/runlight-claude/.claude-plugin/plugin.json"
CLAUDE_PLUGIN_HOOK="$ROOT_DIR/plugins/runlight-claude/scripts/runlight-hook.sh"

grep -q 'TRANSCRIPT_PATH' "$CODEX_ADAPTER"
grep -q '_session_id_exists_in_codex_state' "$CODEX_ADAPTER"
grep -q 'workspace: {cwd: $cwd, repo_root: $rr' "$CODEX_PLUGIN"
grep -q 'project_val="$(basename "${repo_root:-${CWD:-.}}"' "$CODEX_PLUGIN"
grep -q '"hooks": "./hooks/hooks.json"' "$CLAUDE_PLUGIN_JSON"
grep -q 'runlight@runlight-local' "$CLAUDE_PLUGIN_HOOK"
grep -q 'runlight"].options' "$CLAUDE_PLUGIN_HOOK"

echo "hook contracts ok"
