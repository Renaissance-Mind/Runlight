#!/bin/bash
# ============================================================
# AgentMonitor Hook for Codex
# Sends lifecycle events to AgentMonitor server.
# Fail-open: errors never break the host agent.
# ============================================================
trap 'exit 0' ERR EXIT
set +e +u

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS_FILE="${HOOK_DIR}/settings.json"

if [ -f "$SETTINGS_FILE" ] && command -v jq &>/dev/null; then
  _cfg_url="$(jq -r '.server_url // empty' "$SETTINGS_FILE" 2>/dev/null)"
  _cfg_token="$(jq -r '.token // empty' "$SETTINGS_FILE" 2>/dev/null)"
fi

_trim() {
  printf "%s" "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

AGENT_MONITOR_SERVER_URL="$(_trim "${AGENT_MONITOR_SERVER_URL:-${_cfg_url:-http://127.0.0.1:8766}}")"
AGENT_MONITOR_SERVER_URL="$(printf "%s" "$AGENT_MONITOR_SERVER_URL" | sed 's#/*$##')"
[ -z "$AGENT_MONITOR_SERVER_URL" ] && AGENT_MONITOR_SERVER_URL="http://127.0.0.1:8766"
AGENT_MONITOR_TOKEN="$(_trim "${AGENT_MONITOR_TOKEN:-${_cfg_token:-}}")"
CODEX_HOME_DIR="${CODEX_HOME:-${HOME}/.codex}"
CODEX_STATE_DB="${AGENT_MONITOR_CODEX_STATE_DB:-${CODEX_HOME_DIR}/state_5.sqlite}"
CODEX_GLOBAL_STATE="${AGENT_MONITOR_CODEX_GLOBAL_STATE:-${CODEX_HOME_DIR}/.codex-global-state.json}"
CODEX_SESSION_INDEX="${AGENT_MONITOR_CODEX_SESSION_INDEX:-${CODEX_HOME_DIR}/session_index.jsonl}"

_STDIN="$(cat)"

_jq() {
  echo "$_STDIN" | jq -r "$1 // empty" 2>/dev/null || echo ""
}

HOOK_EVENT="$(_jq '.hook_event_name')"
SESSION_ID="$(_jq '.session_id')"
TOOL_NAME="$(_jq '.tool_name')"
CWD="$(_jq '.cwd')"
MODEL="$(_jq '.model')"

[ -z "$SESSION_ID" ] && exit 0

_auth_header=""
[ -n "$AGENT_MONITOR_TOKEN" ] && _auth_header="-H \"Authorization: Bearer $AGENT_MONITOR_TOKEN\""

_sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

_clean_session_name() {
  printf "%s" "$1" | tr '\r' '\n' | sed '/^[[:space:]]*$/d' | head -1 | cut -c1-240
}

_resolve_session_name() {
  local name sid_sql
  if [ -f "$CODEX_STATE_DB" ] && command -v sqlite3 &>/dev/null; then
    sid_sql="$(_sql_escape "$SESSION_ID")"
    name="$(sqlite3 "$CODEX_STATE_DB" "SELECT title FROM threads WHERE id = '${sid_sql}' LIMIT 1;" 2>/dev/null)"
    if [ -n "$name" ]; then
      _clean_session_name "$name"
      return 0
    fi
  fi

  if [ -f "$CODEX_SESSION_INDEX" ] && command -v jq &>/dev/null; then
    name="$(jq -r --arg sid "$SESSION_ID" '
      select(.id == $sid)
      | (.thread_name // "" | split("\n") | map(select(test("\\S"))) | .[0] // "")
    ' "$CODEX_SESSION_INDEX" 2>/dev/null | tail -1)"
    _clean_session_name "$name"
  fi
}

_resolve_session_pin() {
  if [ -f "$CODEX_GLOBAL_STATE" ] && command -v jq &>/dev/null; then
    if jq -e --arg sid "$SESSION_ID" '.["pinned-thread-ids"] // [] | index($sid)' "$CODEX_GLOBAL_STATE" >/dev/null 2>&1; then
      printf "true"
      return 0
    fi
  fi
  printf "false"
}

SESSION_NAME="$(_resolve_session_name)"
SESSION_PIN="$(_resolve_session_pin)"

_send_event() {
  local event_type="$1"
  local summary="$2"
  local severity="${3:-info}"
  local payload="$4"

  local hostname_val
  hostname_val="$(hostname -s 2>/dev/null || echo unknown)"
  local os_val
  os_val="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo unknown)"
  local arch_val
  arch_val="$(uname -m 2>/dev/null || echo unknown)"
  local user_val
  user_val="$(whoami 2>/dev/null || echo unknown)"
  local branch_val
  branch_val="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  local commit_val
  commit_val="$(git -C "$CWD" rev-parse --short HEAD 2>/dev/null || echo "")"
  local project_val
  project_val="$(basename "$CWD" 2>/dev/null || echo "")"

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local json
  json=$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg sname "$SESSION_NAME" \
    --argjson spin "$SESSION_PIN" \
    --arg et "$event_type" \
    --arg ts "$ts" \
    --arg sev "$severity" \
    --arg sum "$summary" \
    --arg hn "$hostname_val" \
    --arg os "$os_val" \
    --arg arch "$arch_val" \
    --arg usr "$user_val" \
    --arg cwd "$CWD" \
    --arg br "$branch_val" \
    --arg cm "$commit_val" \
    --arg pn "$project_val" \
    --argjson payload "${payload:-null}" \
    '{
      session_id: $sid,
      session_name: $sname,
      session_pin: $spin,
      agent_type: "codex",
      adapter_name: "codex-hook",
      adapter_version: "0.1.0",
      event_type: $et,
      event_time: $ts,
      severity: $sev,
      summary: $sum,
      machine: {hostname: $hn, os: $os, arch: $arch, user: $usr},
      workspace: {cwd: $cwd, git_branch: $br, git_commit: $cm, project_name: $pn},
      payload: $payload
    }' 2>/dev/null) || return 0

  curl -sf -X POST "${AGENT_MONITOR_SERVER_URL}/api/events" \
    -H "Content-Type: application/json" \
    ${AGENT_MONITOR_TOKEN:+-H "Authorization: Bearer $AGENT_MONITOR_TOKEN"} \
    -d "$json" \
    --connect-timeout 2 --max-time 5 \
    >/dev/null 2>&1 &
}

case "$HOOK_EVENT" in
  SessionStart)
    _send_event "session.started" "Codex session started (model: ${MODEL})" "info" \
      "$(jq -n --arg m "$MODEL" '{model: $m}')"
    ;;

  PreToolUse)
    local_cmd="$(_jq '.tool_input.command')"
    local_file="$(_jq '.tool_input.file_path')"
    case "$TOOL_NAME" in
      Bash|bash)
        short_cmd="$(echo "$local_cmd" | head -1 | cut -c1-100)"
        _send_event "command.started" "Bash: ${short_cmd}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" --arg c "$short_cmd" '{tool_name: $t, command_label: $c}')"
        ;;
      *)
        _send_event "tool.started" "Tool: ${TOOL_NAME}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" --arg f "$local_file" '{tool_name: $t, file_path: $f}')"
        ;;
    esac
    ;;

  PostToolUse)
    case "$TOOL_NAME" in
      Bash|bash)
        _send_event "command.finished" "Bash done: ${TOOL_NAME}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" '{tool_name: $t}')"
        ;;
      *)
        _send_event "tool.finished" "Tool done: ${TOOL_NAME}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" '{tool_name: $t}')"
        ;;
    esac
    ;;

  PostToolUseFailure)
    _send_event "tool.finished" "Tool failed: ${TOOL_NAME}" "warning" \
      "$(jq -n --arg t "$TOOL_NAME" '{tool_name: $t, failed: true}')"
    ;;

  UserPromptSubmit)
    _send_event "message.started" "User prompt submitted" "info" null
    ;;

  Stop)
    _send_event "session.completed" "Codex session completed" "info" null
    ;;
esac

exit 0
