#!/bin/bash
# Remove Runlight hooks from Claude Code.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CLI="${SCRIPT_DIR}/../../bin/runlight.js"

if command -v runlight >/dev/null 2>&1; then
  exec runlight plugin claude --uninstall
fi

if [ -f "$REPO_CLI" ]; then
  exec node "$REPO_CLI" plugin claude --uninstall
fi

echo "Error: runlight CLI not found." >&2
exit 1
