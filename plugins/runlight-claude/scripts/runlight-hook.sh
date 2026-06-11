#!/bin/bash
# Runlight Claude Code plugin hook shim.
# The plugin hook only talks to the local Runlight daemon via the npm CLI.
trap 'exit 0' ERR EXIT
set +e +u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_CLI="${SCRIPT_DIR}/../../../bin/runlight.js"

if command -v runlight >/dev/null 2>&1; then
  exec runlight hook claude
fi

if [ -f "$REPO_CLI" ]; then
  exec node "$REPO_CLI" hook claude
fi

exit 0
