#!/bin/bash
# Install Runlight daemon-first hooks into Codex.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CLI="${SCRIPT_DIR}/../../bin/runlight.js"

if command -v runlight >/dev/null 2>&1; then
  exec runlight plugin codex
fi

if [ -f "$REPO_CLI" ]; then
  exec node "$REPO_CLI" plugin codex --command "node \"$REPO_CLI\" hook codex"
fi

echo "Error: runlight CLI not found. Install the npm package first: npm install -g runlight" >&2
exit 1
