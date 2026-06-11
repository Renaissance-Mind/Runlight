#!/bin/bash
# Runlight Claude Code plugin installer.
#
# Usage:
#   bash install.sh                                        # install hooks
#   bash install.sh --server http://host:8766 --token sk-x # install + set config
#   bash install.sh --uninstall                            # remove hooks
#
# After install, change server/token by editing pluginConfigs in
# ~/.claude/settings.json — no reinstall needed, next hook call picks it up.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
HOOK_SCRIPT="$PLUGIN_DIR/scripts/runlight-hook.sh"
DEFAULT_SERVER="http://127.0.0.1:8766"
MARKER="runlight-hook.sh"
LEGACY_MARKER="agent-monitor-hook.sh"
PLUGIN_CONFIG_KEY="${RUNLIGHT_CLAUDE_PLUGIN_CONFIG_KEY:-runlight@runlight-local}"

SERVER_URL=""
TOKEN=""
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)    SERVER_URL="$2"; shift 2 ;;
    --server=*)  SERVER_URL="${1#*=}"; shift ;;
    --token)     TOKEN="$2"; shift 2 ;;
    --token=*)   TOKEN="${1#*=}"; shift ;;
    --uninstall) UNINSTALL=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ ! -f "$HOOK_SCRIPT" ]; then
  echo "ERROR: hook script not found at $HOOK_SCRIPT"
  exit 1
fi

if [ ! -f "$SETTINGS_FILE" ]; then
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo '{}' > "$SETTINGS_FILE"
fi

# --- remove existing runlight hooks ---
_remove_hooks() {
  python3 << PYEOF
import json
with open("$SETTINGS_FILE") as f:
    settings = json.load(f)
hooks = settings.get("hooks", {})
removed = 0
for event in list(hooks.keys()):
    before = len(hooks[event])
    hooks[event] = [
        h for h in hooks[event]
        if not any(
            "$MARKER" in hook.get("command", "")
            or "$LEGACY_MARKER" in hook.get("command", "")
            for hook in h.get("hooks", [])
        )
    ]
    removed += before - len(hooks[event])
    if not hooks[event]:
        del hooks[event]
settings["hooks"] = hooks
with open("$SETTINGS_FILE", "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
if removed > 0:
    print(f"Removed {removed} existing hook(s).")
PYEOF
}

if $UNINSTALL; then
  _remove_hooks
  echo "Done. Restart Claude Code for changes to take effect."
  exit 0
fi

# --- install hooks ---
_remove_hooks

python3 << PYEOF
import json

SETTINGS = "$SETTINGS_FILE"
HOOK_SCRIPT = "$HOOK_SCRIPT"
SERVER_URL = "$SERVER_URL" or "$DEFAULT_SERVER"
TOKEN = "$TOKEN"
PLUGIN_CONFIG_KEY = "$PLUGIN_CONFIG_KEY"

with open(SETTINGS) as f:
    settings = json.load(f)

hooks = settings.get("hooks", {})

EVENTS = [
    "SessionStart", "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "PermissionRequest", "UserPromptSubmit", "SubagentStart",
    "SubagentStop", "SessionEnd", "Stop",
]

cmd = f'bash "{HOOK_SCRIPT}"'
entry = {"hooks": [{"type": "command", "command": cmd, "timeout": 5, "async": True}]}

for event in EVENTS:
    hooks.setdefault(event, []).append(entry)

settings["hooks"] = hooks

# Store config in pluginConfigs (hook reads from here at runtime)
pc = settings.setdefault("pluginConfigs", {})
opts = pc.setdefault(PLUGIN_CONFIG_KEY, {}).setdefault("options", {})
opts["server_url"] = SERVER_URL
if TOKEN:
    opts["token"] = TOKEN

with open(SETTINGS, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)

print(f"Installed hooks for {len(EVENTS)} lifecycle events.")
print(f"Server: {SERVER_URL}")
print()
print("To change server/token later, edit pluginConfigs in:")
print(f"  {SETTINGS}")
print("No reinstall needed — changes take effect on the next hook call.")
PYEOF
