# Runlight Codex Plugin

This package installs the Runlight Codex integration workflow. Installing the
plugin makes the Runlight skill and packaged scripts available in Codex; it does
not automatically modify global Codex hooks.

Runtime collection is daemon-first. Codex hooks call `runlight hook codex`, the
local daemon queues events under `~/.runlight/queue`, and the daemon uploads to
the configured Runlight server.

Install from the repo marketplace:

```bash
codex plugin marketplace add /path/to/Runlight
codex plugin add runlight@runlight-local
```

Then install and configure the local npm CLI:

```bash
npm install -g runlight
runlight onboarding
```

To install only the Codex hook:

```bash
runlight plugin codex
```

The installer writes lifecycle hooks into `$CODEX_HOME/hooks.json` or
`~/.codex/hooks.json`. The hook command is `runlight hook codex`; server URL and
upload token live in `~/.runlight/config.json`, not in the hook command.

If you are using the packaged skill script directly:

```bash
RUNLIGHT_PLUGIN_DIR="$(ls -td ~/.codex/plugins/cache/runlight-local/runlight/* | head -1)"
bash "$RUNLIGHT_PLUGIN_DIR/skills/runlight/scripts/install-codex-hook.sh"
```

If Runlight does not update after the plugin is installed, run `runlight status`
first. The hook installer must have written Runlight entries into Codex's hooks
file, hooks must be enabled, the local daemon must be running, and Codex must
trust hooks for the workspace before lifecycle events are emitted.
