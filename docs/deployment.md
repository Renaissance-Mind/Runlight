# Runlight Deployment

Runlight has three independently deployable pieces:

- Agent Client: Codex, Claude Code, Python, or other adapters that emit events.
- Server: embedded local server, FastAPI storage service, or Cloudflare Worker.
- Dashboard: embedded static dashboard, React/Tauri UI, or hosted Worker assets.

The connection contract is the same for all deployments:

```json
{
  "server_url": "http://<server-host>:18765",
  "token": ""
}
```

An empty token maps to the server's `default` user on local/self-hosted
embedded servers. A non-empty token maps to the same hashed local user id on
embedded servers, or to a configured user through `RUNLIGHT_TOKEN_MAP` on the
FastAPI server.

## Local Single-User

Use this when the agent client, server, and dashboard are all on the same
machine.

```bash
runlight setup --local
```

This starts the embedded local server, dashboard, and daemon. Defaults are:

```json
{
  "server_url": "http://127.0.0.1:18765",
  "token": ""
}
```

## LAN Multi-Device

Use this when agent clients or dashboards run on other machines in the same
network.

Start the server machine:

```bash
runlight setup --self-hosted --role server
```

Connect client machines:

```bash
runlight setup --self-hosted --role client --server <server-lan-ip>:18765
```

If you want the server machine to monitor itself too:

```bash
runlight setup --self-hosted --role both
```

The embedded server accepts empty credentials as the `default` user. If clients
provide bearer tokens explicitly, the same token maps to the same hashed local
user id.

## Remote Server

For an internet-facing server, put TLS and any additional hardening in front of
the FastAPI process through a reverse proxy. The Runlight server still sees
the same URL/token contract:

```json
{
  "server_url": "https://monitor.example.com",
  "token": "tok-alice"
}
```

Recommended server environment:

```bash
RUNLIGHT_DATABASE_URL='postgresql+asyncpg://runlight:<password>@<host>:5432/runlight'
RUNLIGHT_TOKEN_MAP='tok-alice:alice,tok-bob:bob'
RUNLIGHT_CORS_ORIGINS='https://dashboard.example.com'
```

## Configure The Local Daemon

Codex and Claude hooks do not store server URL or upload tokens in hook scripts.
Install and configure the npm CLI once on each machine:

```bash
npm install -g runlight
runlight setup
```

Use `runlight setting` for interactive configuration and `runlight status` or
`runlight health` to verify the local queue, daemon, server, and plugin state.
Local settings live in `~/.runlight/config.json` unless `RUNLIGHT_HOME` is set.

## Configure Codex Hook Client

Install Codex hooks through the local CLI:

```bash
runlight plugin codex
```

The installer writes lifecycle hook entries to `$CODEX_HOME/hooks.json` when
`CODEX_HOME` is set, otherwise `~/.codex/hooks.json`. The hook command is
`runlight hook codex`, which sends raw hook payloads to the local daemon. The
daemon adds Codex session titles and pinned-thread state when the local Codex
state files are available.

## Configure Claude Code Hook Client

Install Claude Code hooks through the local CLI:

```bash
runlight plugin claude
```

The installer writes hook entries into `~/.claude/settings.json` unless
`CLAUDE_SETTINGS_FILE` is set. The hook command is `runlight hook claude`, which
also sends raw hook payloads to the local daemon.

The packaged plugin manifests remain useful for marketplace and skill workflows,
but runtime connection settings are still owned by `runlight login` and
`runlight setting`.

## Configure Python Or Generic CLI Clients

The Python adapter uses environment variables:

```bash
export RUNLIGHT_SERVER_URL=http://127.0.0.1:18765
export RUNLIGHT_TOKEN=
```

The CLI wrapper is installed by the `runlight-adapter` package and exposes:

```bash
runlight-adapter run --agent generic -- <command>
runlight-adapter event --session <id> --type <event_type>
runlight-adapter heartbeat --session <id>
runlight-adapter finish --session <id> --result completed
```

Python clients send heartbeat, sequence, dedupe, and offline-queue metadata; the
Codex and Claude hook commands remain fail-open and best-effort while the daemon
handles retry.

## Configure Worker Server

For the Cloudflare Worker deployment, viewers sign in with GitHub or Google
OAuth and the local daemon uploads agent events with bearer tokens generated
from the dashboard.
After deploying, run the setup flow on each monitored machine. It opens
`/connect?cli_code=...`, signs you in, creates an upload token automatically,
and returns it to the CLI through a short-lived browser handoff:

```bash
runlight setup --server https://runlight.example.com
```

`RUNLIGHT_TOKEN_MAP` with the same `token:user_id` value format as the FastAPI
server is still supported for controlled static deployments. `TOKEN_MAP` remains
supported as a legacy Worker alias.

## Configure Dashboard

Open the dashboard settings page:

```text
http://127.0.0.1:3000/settings
```

Save the server URL and token. The dashboard stores that runtime connection in
browser local storage and then probes `/api/health` plus `/api/users/current` to
show the active user.

## Configure Menubar

The macOS menubar app stores its own runtime connection in UserDefaults. Its
server URL and token are independent from the dashboard and local daemon
settings.

## Configuration Boundaries

The local daemon, dashboard, menubar, and server deployment each keep their own
connection settings. Changing the dashboard URL/token does not update the local
daemon, and changing `~/.runlight/config.json` does not update dashboard or
menubar clients. Hook commands stay stable as `runlight hook codex` and
`runlight hook claude`. When moving between local FastAPI, LAN, and Worker
deployments, update all active surfaces that should point at the new server.
