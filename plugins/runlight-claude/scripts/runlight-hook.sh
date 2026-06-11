#!/bin/bash
# Runlight Hook for Claude Code. Sends lifecycle events to Runlight server.
trap 'exit 0' ERR EXIT
set +e +u

_trim() {
  printf "%s" "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# Read config from ~/.claude/settings.json pluginConfigs (env vars override)
[ -z "${RUNLIGHT_SERVER_URL:-}" ] && RUNLIGHT_SERVER_URL="${AGENT_MONITOR_SERVER_URL:-}"
[ -z "${RUNLIGHT_TOKEN:-}" ] && RUNLIGHT_TOKEN="${AGENT_MONITOR_TOKEN:-}"
if [ -z "${RUNLIGHT_SERVER_URL:-}" ] || [ -z "${RUNLIGHT_TOKEN:-}" ]; then
  _SETTINGS="$HOME/.claude/settings.json"
  if [ -f "$_SETTINGS" ] && command -v jq >/dev/null 2>&1; then
    _PC='
      (.pluginConfigs // {}) as $pc
      | (
          $pc["runlight@runlight-local"].options
          // $pc["runlight"].options
          // $pc["agent-monitor@agent-monitor-local"].options
          // $pc["agent-monitor"].options
          // ([ $pc | to_entries[] | select(.key | test("runlight|agent-monitor")) | .value.options ][0])
          // {}
        )
    '
    [ -z "${RUNLIGHT_SERVER_URL:-}" ] && \
      RUNLIGHT_SERVER_URL="$(jq -r "${_PC} | .server_url // empty" "$_SETTINGS" 2>/dev/null || echo "")"
    [ -z "${RUNLIGHT_TOKEN:-}" ] && \
      RUNLIGHT_TOKEN="$(jq -r "${_PC} | .token // empty" "$_SETTINGS" 2>/dev/null || echo "")"
  fi
fi

RUNLIGHT_SERVER_URL="$(_trim "${RUNLIGHT_SERVER_URL:-http://127.0.0.1:8766}")"
RUNLIGHT_SERVER_URL="$(printf "%s" "$RUNLIGHT_SERVER_URL" | sed 's#/*$##')"
[ -z "$RUNLIGHT_SERVER_URL" ] && RUNLIGHT_SERVER_URL="http://127.0.0.1:8766"
RUNLIGHT_TOKEN="$(_trim "${RUNLIGHT_TOKEN:-}")"

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

_send_event() {
  local event_type="$1"
  local summary="$2"
  local severity="${3:-info}"
  local payload="$4"

  local hostname_val os_val arch_val user_val branch_val commit_val project_val ts
  hostname_val="$(hostname -s 2>/dev/null || echo unknown)"
  os_val="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo unknown)"
  arch_val="$(uname -m 2>/dev/null || echo unknown)"
  user_val="$(whoami 2>/dev/null || echo unknown)"
  branch_val="$(git -C "${CWD:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  commit_val="$(git -C "${CWD:-.}" rev-parse --short HEAD 2>/dev/null || echo "")"
  local repo_root
  repo_root="$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null || echo "")"
  project_val="$(basename "${repo_root:-${CWD:-.}}" 2>/dev/null || echo "")"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local json
  json=$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg et "$event_type" \
    --arg ts "$ts" \
    --arg sev "$severity" \
    --arg sum "$summary" \
    --arg hn "$hostname_val" \
    --arg os "$os_val" \
    --arg arch "$arch_val" \
    --arg usr "$user_val" \
    --arg cwd "${CWD:-.}" \
    --arg rr "$repo_root" \
    --arg br "$branch_val" \
    --arg cm "$commit_val" \
    --arg pn "$project_val" \
    --argjson payload "${payload:-null}" \
    '{
      session_id: $sid,
      agent_type: "claude_code",
      adapter_name: "claude-code-hook",
      adapter_version: "0.1.0",
      event_type: $et,
      event_time: $ts,
      severity: $sev,
      summary: $sum,
      machine: {hostname: $hn, os: $os, arch: $arch, user: $usr},
      workspace: {cwd: $cwd, repo_root: $rr, git_branch: $br, git_commit: $cm, project_name: $pn},
      payload: $payload
    }' 2>/dev/null) || return 0

  curl -sf -X POST "${RUNLIGHT_SERVER_URL}/api/events" \
    -H "Content-Type: application/json" \
    ${RUNLIGHT_TOKEN:+-H "Authorization: Bearer $RUNLIGHT_TOKEN"} \
    -d "$json" \
    --connect-timeout 2 --max-time 5 \
    >/dev/null 2>&1 &
}

case "$HOOK_EVENT" in
  SessionStart)
    _send_event "session.started" "Claude Code session started (model: ${MODEL})" "info" \
      "$(jq -n --arg m "$MODEL" --arg src "$(_jq '.source')" '{model: $m, source: $src}')"
    ;;
  PreToolUse)
    case "$TOOL_NAME" in
      Bash|bash)
        short_cmd="$(_jq '.tool_input.command' | head -1 | cut -c1-100)"
        _send_event "command.started" "Bash: ${short_cmd}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" --arg c "$short_cmd" '{tool_name: $t, command_label: $c}')"
        ;;
      *)
        file_path="$(_jq '.tool_input.file_path')"
        _send_event "tool.started" "Tool: ${TOOL_NAME}" "info" \
          "$(jq -n --arg t "$TOOL_NAME" --arg f "$file_path" '{tool_name: $t, file_path: $f}')"
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
  PermissionRequest)
    _send_event "permission.requested" "Permission: ${TOOL_NAME}" "info" \
      "$(jq -n --arg t "$TOOL_NAME" '{tool_name: $t}')"
    ;;
  UserPromptSubmit)
    _send_event "message.started" "User prompt submitted" "info" null
    ;;
  SubagentStart)
    _send_event "tool.started" "Subagent started" "info" \
      "$(jq -n --arg t "subagent" '{tool_name: $t}')"
    ;;
  SubagentStop)
    _send_event "tool.finished" "Subagent finished" "info" \
      "$(jq -n --arg t "subagent" '{tool_name: $t}')"
    ;;
  SessionEnd)
    _send_event "session.completed" "Claude Code session ended" "info" \
      "$(jq -n --arg r "$(_jq '.reason')" '{reason: $r}')"
    ;;
  Stop)
    _send_event "message.finished" "Claude Code response finished" "info" null
    ;;
esac

exit 0
