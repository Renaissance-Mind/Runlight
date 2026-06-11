#!/bin/bash
# Install Runlight daemon-first hooks into Claude Code.
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CLI="${PLUGIN_DIR}/../../bin/runlight.js"

if [ "${1:-}" = "--uninstall" ]; then
  if command -v runlight >/dev/null 2>&1; then
    exec runlight plugin claude --uninstall
  fi
  if [ -f "$REPO_CLI" ]; then
    exec node "$REPO_CLI" plugin claude --uninstall
  fi
fi

if command -v runlight >/dev/null 2>&1; then
  exec runlight plugin claude
fi

if [ -f "$REPO_CLI" ]; then
  exec node "$REPO_CLI" plugin claude --command "node \"$REPO_CLI\" hook claude"
fi

echo "Error: runlight CLI not found. Install the npm package first: npm install -g runlight" >&2
exit 1
