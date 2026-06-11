#!/bin/bash
# Remove Runlight hooks from Codex.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CLI="${SCRIPT_DIR}/../../bin/runlight.js"

if command -v runlight >/dev/null 2>&1; then
  exec runlight plugin codex --uninstall
fi

if [ -f "$REPO_CLI" ]; then
  exec node "$REPO_CLI" plugin codex --uninstall
fi

echo "Error: runlight CLI not found." >&2
exit 1
