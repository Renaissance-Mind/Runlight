# Runlight Claude Code Plugin

Records Claude Code lifecycle events through the local Runlight daemon. Claude
hooks call `runlight hook claude`; the daemon queues events locally and uploads
them to the configured Runlight server.

## Install

Preferred user path:

```bash
npm install -g runlight
runlight onboarding
```

Claude-only hook installation:

```bash
runlight plugin claude
```

From this plugin directory:

```bash
bash install.sh
```

Restart Claude Code for hooks to take effect.

## Uninstall

```bash
runlight plugin claude --uninstall
```

or:

```bash
bash install.sh --uninstall
```

## Notes

The plugin manifest declares hook metadata for clients that support plugin hook
discovery. Runtime server URL and upload token are configured with
`runlight login` or `runlight onboarding`, not inside Claude hook commands.
