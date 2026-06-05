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
~/.codex/plugins/cache/agent-monitor-local/agent-monitor/0.1.0/skills/agent-monitor/scripts/settings.json
```

## Configure Dashboard

Open the dashboard settings page:

```text
http://127.0.0.1:3000/settings
```

Save the server URL and token. The dashboard stores that runtime connection in
browser local storage and then probes `/api/health` plus `/api/users/current` to
show the active user.
