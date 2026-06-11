# Runlight Codex Plugin

This package installs the Runlight Codex integration workflow. Installing
the plugin makes the Runlight skill and packaged scripts available in Codex;
it does not automatically modify global Codex hooks. The current integration
records events through Codex lifecycle hooks after the hook installer is run.

Each Codex event includes `session_name` from the local Codex thread title and
`session_pin` from the local Codex pinned-thread state when those files are
available.

Install from the repo marketplace:

```bash
codex plugin marketplace add /Users/caopu/workspace/Runlight
codex plugin add runlight@runlight-local
```

Start a new Codex thread after installation so the bundled skill is loaded.
Then activate monitoring by running the bundled hook installer from the installed
plugin cache. This writes lifecycle hooks into `$CODEX_HOME/hooks.json` or
`~/.codex/hooks.json` and stores editable connection settings next to the hook
script.

Default server URL:

```text
http://127.0.0.1:8766
```

Activation command:

```bash
RUNLIGHT_PLUGIN_DIR="$(ls -td ~/.codex/plugins/cache/runlight-local/runlight/* | head -1)"
bash "$RUNLIGHT_PLUGIN_DIR/skills/runlight/scripts/install-codex-hook.sh"
```

If Runlight does not update after the plugin is installed, check hook
activation first. The hook installer must have written Runlight entries into
Codex's hooks file, hooks must be enabled, and the Codex app must trust hooks for
this workspace in Settings before lifecycle events are emitted.

Plugin installation makes the Runlight skill available; hook installation is
the step that starts event collection. Re-running the installer replaces older
Runlight hook entries that point at previous plugin cache paths.
