# AgentMonitor Deployment

AgentMonitor has three independently deployable pieces:

- Agent Client: Codex, Claude Code, Python, or other adapters that emit events.
- Server: FastAPI storage and query service.
- Dashboard: React/Tauri UI that queries the server with the same optional token model.

The connection contract is the same for all deployments:

```json
{
  "server_url": "http://<server-host>:8766",
  "token": ""
}
```

An empty token maps to the server's `default` user. A non-empty token maps to a
user through `AGENT_MONITOR_TOKEN_MAP`.

## Local Single-User

Use this when the agent client, server, and dashboard are all on the same
machine.

Start the server:

```bash
cd /Users/caopu/workspace/AgentMonitor/server
/Users/caopu/miniforge3/bin/python -m uvicorn agent_monitor.app:app --host 127.0.0.1 --port 8766
```

Start the dashboard:

```bash
cd /Users/caopu/workspace/AgentMonitor/dashboard
npm run dev -- --host 127.0.0.1 --port 3000
```

Use this client or dashboard connection:

```json
{
  "server_url": "http://127.0.0.1:8766",
  "token": ""
}
```

## LAN Multi-Device

Use this when agent clients or dashboards run on other machines in the same
network.

Start the server on the host machine:

```bash
cd /Users/caopu/workspace/AgentMonitor/server
AGENT_MONITOR_TOKEN_MAP='tok-alice:alice,tok-bob:bob' \
  /Users/caopu/miniforge3/bin/python -m uvicorn agent_monitor.app:app --host 0.0.0.0 --port 8766
```

Use the server machine's LAN IP from clients and dashboards:

```json
{
  "server_url": "http://<server-lan-ip>:8766",
  "token": "tok-alice"
}
```

The dashboard sends the token as `Authorization: Bearer <token>` on query
requests. Agent clients send the same header on ingest requests.

## Remote Server

For an internet-facing server, put TLS and any additional hardening in front of
the FastAPI process through a reverse proxy. The AgentMonitor server still sees
the same URL/token contract:

```json
{
  "server_url": "https://monitor.example.com",
  "token": "tok-alice"
}
```

Recommended server environment:

```bash
AGENT_MONITOR_DATABASE_URL='postgresql+asyncpg://agent_monitor:<password>@<host>:5432/agent_monitor'
AGENT_MONITOR_TOKEN_MAP='tok-alice:alice,tok-bob:bob'
AGENT_MONITOR_CORS_ORIGINS='https://dashboard.example.com'
```

## Configure Codex Hook Client

The Codex plugin stores connection settings next to its hook script:

```json
{
  "server_url": "http://127.0.0.1:8766",
  "token": ""
}
```

For the local repository adapter, edit:

```text
/Users/caopu/workspace/AgentMonitor/adapters/codex-hook/settings.json
```

For the installed Codex plugin, edit:

```text
~/.codex/plugins/cache/agent-monitor-local/agent-monitor/<version>/skills/agent-monitor/scripts/settings.json
```

Installing the Codex plugin makes the skill available; it does not itself write
Codex lifecycle hooks. Run the packaged skill installer after plugin install or
update:

```bash
AGENT_MONITOR_PLUGIN_DIR="$(ls -td ~/.codex/plugins/cache/agent-monitor-local/agent-monitor/* | head -1)"
bash "$AGENT_MONITOR_PLUGIN_DIR/skills/agent-monitor/scripts/install-codex-hook.sh"
```

The repository adapter installer is for local development. It writes to
`$CODEX_HOME/hooks.json` when `CODEX_HOME` is set, otherwise `~/.codex/hooks.json`.

## Configure Claude Code Hook Client

The Claude Code plugin declares a hook inventory in its plugin manifest, but the
reliable local install path is still the packaged installer because current
Claude Code plugin loading does not consistently register hooks from plugin
metadata.

```bash
cd /Users/caopu/workspace/AgentMonitor/plugins/agent-monitor-claude
bash install.sh --server http://127.0.0.1:8766
```

The installer writes hooks into `~/.claude/settings.json` and stores runtime
connection options under `pluginConfigs`. The hook reads these keys, with
`AGENT_MONITOR_SERVER_URL` and `AGENT_MONITOR_TOKEN` taking precedence.

The repository adapter under `adapters/claude-code-hook` is for local
development. It stores connection settings in `adapters/claude-code-hook/settings.json`
and can target a non-default Claude settings file with `CLAUDE_SETTINGS_FILE`.

## Configure Python Or Generic CLI Clients

The Python adapter uses environment variables:

```bash
export AGENT_MONITOR_SERVER_URL=http://127.0.0.1:8766
export AGENT_MONITOR_TOKEN=
```

The CLI wrapper is installed by the `agent-monitor-adapter` package and exposes:

```bash
agent-monitor run --agent codex -- <command>
agent-monitor event --session <id> --type <event_type>
agent-monitor heartbeat --session <id>
agent-monitor finish --session <id> --result completed
```

Python clients send heartbeat, sequence, dedupe, and offline-queue metadata; the
shell hook clients remain fail-open and best-effort.

## Configure Worker Server

For the Cloudflare Worker deployment, the same client URL/token contract applies.
The Worker environment names are platform-specific:

```bash
npx wrangler secret put TOKEN_MAP
```

Use `TOKEN_MAP` with the same `token:user_id` value format as
`AGENT_MONITOR_TOKEN_MAP` on the FastAPI server.

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
server URL and token are independent from the dashboard and agent hook settings.

## Configuration Boundaries

Agent hooks, dashboard, menubar, and server deployment each keep their own
connection settings. Changing the dashboard URL/token does not update existing
hooks, and changing a hook settings file does not update dashboard or menubar
clients. When moving between local FastAPI, LAN, and Worker deployments, update
all active surfaces that should point at the new server.
