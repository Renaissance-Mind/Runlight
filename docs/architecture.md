# AgentMonitor Architecture

## Overview

AgentMonitor is a passive observability system for AI coding agents. It records lifecycle events (session start/end, tool use, prompts, completions) and provides real-time visibility into agent activity.

The system has three layers:

```
Client  ──▶  Server  ◀──  Viewer
(collect)    (store)      (display)
```

- **Client**: Adapters/plugins installed inside each agent, collecting and reporting events.
- **Server**: Receives, stores, and queries events via a REST API.
- **Viewer**: Displays agent activity. Multiple viewer types share the same server API.

## Components

### Client

Plugins that hook into agent lifecycle events and POST them to the server.

| Agent | Plugin Location | Install Method |
|---|---|---|
| Claude Code | `plugins/agent-monitor-claude/` | Plugin marketplace or `install.sh` |
| Codex CLI | `plugins/agent-monitor-codex/` | `install-codex-hook.sh` |

All clients share the same contract:
- Report events to `POST /api/events`
- Authenticate with `Authorization: Bearer <token>` (optional)
- Installation is identical for both deployment modes; only configuration differs (see below)

### Server

Two implementations with identical API:

| Version | Location | Tech Stack | Database |
|---|---|---|---|
| Self-hosted | `server/` | Python / FastAPI | SQLite (default) or PostgreSQL |
| Cloud-hosted | `workers/` | TypeScript / Hono | Cloudflare D1 |

### Viewer

Multiple viewers, all consuming the same server API:

| Viewer | Location | Type |
|---|---|---|
| Dashboard | `dashboard/` | Web app (React) |
| Menubar | `menubar/` | macOS desktop app (Tauri) |

---

## Deployment Modes

### Mode 1: Self-Hosted

For personal use or small teams. Zero-config single-user by default.

```
┌─────────────┐     ┌─────────────────────────────┐
│ Client      │     │ Docker / Local               │
│ (plugins)   │────▶│ Server + Dashboard (bundled)  │
│             │     │ SQLite                        │
└─────────────┘     └─────────────────────────────┘
```

**Authentication**: Token-based. Token can be empty (single-user, no auth).

| Component | How to Run |
|---|---|
| Server + Dashboard | `docker-compose up` or `pip install` + `uvicorn` |
| Menubar | Standalone desktop app, connect to local server |
| Client | Install plugin, configure URL + token |

**Client configuration**:

```json
{
  "server_url": "http://127.0.0.1:8766",
  "token": ""
}
```

- `server_url`: Required. Points to the self-hosted server.
- `token`: Optional. Empty = single-user `default` account. Non-empty = looked up in `TOKEN_MAP`.

**Server configuration** (multi-user):

```bash
AGENT_MONITOR_TOKEN_MAP="token_alice:alice,token_bob:bob"
```

### Mode 2: Cloudflare Cloud-Hosted

For multi-user remote access with self-service registration.

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Client      │     │ CF Workers + D1  │     │ CF Pages         │
│ (plugins)   │────▶│ Server           │◀────│ Dashboard        │
└─────────────┘     └──────────────────┘     └──────────────────┘
                           │
                    GitHub/Google OAuth
```

**Authentication**: OAuth login (GitHub/Google) → server auto-creates user → issues API token. Also supports direct token input.

| Component | How to Deploy |
|---|---|
| Server | `wrangler deploy` (Cloudflare Workers + D1) |
| Dashboard | Cloudflare Pages (static build) |
| Menubar | Standalone desktop app, OAuth login or token |
| Client | Install plugin, OAuth login or token |

**Client configuration**:

```json
{
  "server_url": "(built-in, no config needed)",
  "token": "(obtained via OAuth or manual input)"
}
```

- `server_url`: Pre-configured in the cloud-hosted plugin preset. Users don't need to set it.
- `token`: Obtained through OAuth flow in browser, or manually copied from dashboard settings page.

---

## Client Install & Configuration

### Installation

Installation is **identical** regardless of deployment mode:

**Claude Code**:
```bash
# Option A: Plugin marketplace
# /marketplace add github:caopulan/AgentMonitor
# /plugin install agent-monitor

# Option B: Manual
bash plugins/agent-monitor-claude/install.sh
```

**Codex CLI**:
```bash
bash plugins/agent-monitor-codex/skills/agent-monitor/scripts/install-codex-hook.sh
```

### Configuration

Configuration **differs** by deployment mode:

| | Self-Hosted | Cloud-Hosted |
|---|---|---|
| `server_url` | User sets (default `http://127.0.0.1:8766`) | Built-in, no config needed |
| `token` | Optional (empty = no auth) | OAuth login or paste token |

---

## API Contract

All clients and viewers use the same REST API:

```
POST   /api/events                  # Client → Server: ingest event
GET    /api/sessions/live           # Viewer → Server: active sessions
GET    /api/sessions                # Viewer → Server: all sessions
GET    /api/sessions/:id            # Viewer → Server: session detail
GET    /api/sessions/:id/events     # Viewer → Server: session events
GET    /api/events/recent           # Viewer → Server: recent completions
DELETE /api/sessions/:id            # Viewer → Server: delete session
GET    /api/health                  # Health check
GET    /api/users/current           # Current user info
```

Authentication header (optional for self-hosted, required for cloud):
```
Authorization: Bearer <token>
```

---

## Configuration Boundaries

Each component maintains its own connection settings independently:

- Changing dashboard URL/token does not affect client plugins
- Changing a client plugin's config does not affect dashboard or menubar
- When switching between self-hosted and cloud server, update all active components
