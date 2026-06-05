# AgentMonitor Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Agent Client / Server / Dashboard split so clients and dashboards can run on different machines and connect through server URL, port, and optional token.

**Architecture:** Agent clients emit protocol events over HTTP with a small local connection config and fail-open behavior. The server owns storage, token-to-user resolution, and query APIs. Dashboard surfaces, including the React/Tauri dashboard and the future pet surface, consume a shared TypeScript runtime client that exposes sessions, events, health, and current-user state without depending on page components.

**Tech Stack:** FastAPI, SQLAlchemy async, SQLite/Postgres-compatible schema, shell hooks, Python adapter package, React/TypeScript, Vite, Tauri.

---

## Current Completed Slice

Commit `dbd84d7 feat: decouple dashboard server connection` already completed the first dashboard transport slice:

- `dashboard/src/api/config.ts` resolves `serverUrl` and `token`.
- `dashboard/src/api/client.ts` builds absolute `/api/...` URLs and sends `Authorization: Bearer <token>` when configured.
- `dashboard/src/App.tsx` lets the user save dashboard server URL and token at runtime.
- `dashboard/vite.config.ts` no longer relies on a dev proxy.
- Server and Python adapter defaults are aligned at `http://127.0.0.1:8766`.

## Task 1: Shared Dashboard Runtime Client

**Files:**
- Modify: `dashboard/src/api/client.ts`
- Modify: `dashboard/src/types/session.ts`
- Modify: `dashboard/src/hooks/useSessions.ts`
- Modify: `dashboard/src/App.tsx`
- Create: `dashboard/tests/client.test.ts`

- [ ] **Step 1: Write failing client test**

```ts
// dashboard/tests/client.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import {
  fetchCurrentUser,
  probeServerConnection,
} from "../src/api/client.ts";

let serverUrl = "";
let lastAuthorization: string | undefined;
const server = createServer((req, res) => {
  lastAuthorization = req.headers.authorization;
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/health") {
    res.end(JSON.stringify({ status: "ok", service: "agent-monitor" }));
    return;
  }
  if (req.url === "/api/users/current") {
    res.end(JSON.stringify({ user_id: lastAuthorization ? "user-alice" : "default" }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

describe("dashboard runtime API client", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("missing server address");
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetches current user with the configured token", async () => {
    const user = await fetchCurrentUser({ serverUrl, token: "tok-user-1" });

    assert.deepEqual(user, { user_id: "user-alice" });
    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("probes health and current user for reusable dashboard surfaces", async () => {
    const probe = await probeServerConnection({ serverUrl, token: "" });

    assert.equal(probe.ok, true);
    assert.equal(probe.serverUrl, serverUrl);
    assert.equal(probe.userId, "default");
    assert.equal(probe.tokenConfigured, false);
    assert.equal(typeof probe.checkedAt, "string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && node --test --experimental-strip-types tests/client.test.ts`

Expected: FAIL because `fetchCurrentUser` and `probeServerConnection` are not exported.

- [ ] **Step 3: Implement runtime client API**

Add these exported types and functions:

```ts
export interface CurrentUser {
  user_id: string;
}

export interface ServerConnectionProbe {
  ok: boolean;
  serverUrl: string;
  userId: string | null;
  tokenConfigured: boolean;
  checkedAt: string;
  error: string | null;
}

export async function fetchCurrentUser(config: DashboardConnectionConfig = defaultConfig): Promise<CurrentUser> {
  return fetchJSON<CurrentUser>(config, "/users/current");
}

export async function probeServerConnection(config: DashboardConnectionConfig = defaultConfig): Promise<ServerConnectionProbe> {
  const checkedAt = new Date().toISOString();
  try {
    await fetchHealth(config);
    const user = await fetchCurrentUser(config);
    return {
      ok: true,
      serverUrl: config.serverUrl,
      userId: user.user_id,
      tokenConfigured: config.token.trim().length > 0,
      checkedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      serverUrl: config.serverUrl,
      userId: null,
      tokenConfigured: config.token.trim().length > 0,
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Surface connection status in the dashboard**

`dashboard/src/App.tsx` should display the server URL, current user id, and whether the configured token is active. This status must come from `probeServerConnection`, not from local config alone.

- [ ] **Step 5: Run verification**

Run:

```bash
cd dashboard && npm run test:api-config
cd dashboard && node --test --experimental-strip-types tests/client.test.ts
cd dashboard && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/api/client.ts dashboard/src/types/session.ts dashboard/src/hooks/useSessions.ts dashboard/src/App.tsx dashboard/tests/client.test.ts dashboard/package.json
git commit -m "feat: add dashboard runtime connection probe"
```

## Task 2: Agent Client Connection Contract

**Files:**
- Modify: `adapters/codex-hook/agent-monitor-hook.sh`
- Modify: `adapters/claude-code-hook/agent-monitor-hook.sh`
- Modify: `plugins/agent-monitor/skills/agent-monitor/scripts/agent-monitor-hook.sh`
- Modify: `plugins/agent-monitor/skills/agent-monitor/SKILL.md`
- Test: `adapters/python/tests/test_adapter.py`

- [ ] **Step 1: Add a client-side connection contract test**

Extend `adapters/python/tests/test_adapter.py` with:

```py
def test_init_respects_empty_token_as_no_auth_header():
    client = AgentMonitorClient(token="")
    assert client.token is None
```

Run: `cd adapters/python && /Users/caopu/miniforge3/bin/python -m pytest tests/test_adapter.py::TestBaseClient::test_init_respects_empty_token_as_no_auth_header -v`

Expected: FAIL if an empty token is retained as an auth value.

- [ ] **Step 2: Normalize empty tokens in Python client**

Set `self.token` to `None` when constructor or environment token is an empty or whitespace-only string.

- [ ] **Step 3: Normalize shell hook settings**

In each shell hook, trim `AGENT_MONITOR_SERVER_URL`, remove trailing slashes before sending, and treat empty token as no Authorization header. Keep fail-open behavior.

- [ ] **Step 4: Verify hook scripts parse settings**

Run:

```bash
bash -n adapters/codex-hook/agent-monitor-hook.sh
bash -n adapters/claude-code-hook/agent-monitor-hook.sh
bash -n plugins/agent-monitor/skills/agent-monitor/scripts/agent-monitor-hook.sh
cd adapters/python && /Users/caopu/miniforge3/bin/python -m pytest tests
```

- [ ] **Step 5: Commit**

```bash
git add adapters plugins
git commit -m "fix: normalize agent client connection settings"
```

## Task 3: Server Deployment Boundary

**Files:**
- Modify: `server/agent_monitor/config.py`
- Create: `server/tests/test_config.py` if not present, otherwise extend it
- Modify: `docs/superpowers/specs/2026-06-05-agent-monitor-design.md`
- Create: `docs/deployment.md`

- [ ] **Step 1: Write failing config tests**

Extend `server/tests/test_config.py` with:

def test_cors_origins_keeps_wildcard_default():
    settings = Settings()
    assert settings.get_cors_origins() == ["*"]

def test_token_map_ignores_blank_entries():
    settings = Settings(token_map="tok-a:user-a, ,tok-b:user-b")
    assert settings.get_token_map() == {"tok-a": "user-a", "tok-b": "user-b"}
```

Run: `cd server && /Users/caopu/miniforge3/bin/python -m pytest tests/test_config.py -v`

Expected: PASS for existing behavior except any newly introduced validation failures.

- [ ] **Step 2: Document deployment commands**

Create `docs/deployment.md` with explicit local and LAN examples:

````md
# AgentMonitor Deployment

## Local Single-User

Server:

```bash
cd server
AGENT_MONITOR_SERVER_HOST=127.0.0.1 AGENT_MONITOR_SERVER_PORT=8766 \
  /Users/caopu/miniforge3/bin/python -m uvicorn agent_monitor.app:app --host 127.0.0.1 --port 8766
```

Dashboard:

```bash
cd dashboard
npm run dev -- --host 127.0.0.1 --port 3000
```

Client settings:

```json
{"server_url":"http://127.0.0.1:8766","token":""}
```

## LAN Multi-Device

Server:

```bash
cd server
AGENT_MONITOR_TOKEN_MAP='tok-alice:alice' \
  /Users/caopu/miniforge3/bin/python -m uvicorn agent_monitor.app:app --host 0.0.0.0 --port 8766
```

Dashboard and client settings:

```json
{"server_url":"http://<server-ip>:8766","token":"tok-alice"}
```
````

- [ ] **Step 3: Verify docs and server tests**

Run:

```bash
cd server && /Users/caopu/miniforge3/bin/python -m pytest tests/test_config.py
rg -n "876[5]" docs server adapters plugins dashboard
```

- [ ] **Step 4: Commit**

```bash
git add docs server/tests/test_config.py
git commit -m "docs: document agentmonitor deployment modes"
```

## Task 4: Pet-Ready Dashboard Data Boundary

**Files:**
- Create: `dashboard/src/api/viewModels.ts`
- Create: `dashboard/tests/view-models.test.ts`
- Modify: `dashboard/src/components/FloatingHUD.tsx`
- Modify: `dashboard/src/components/SessionsTable.tsx`

- [ ] **Step 1: Write failing view-model test**

```ts
// dashboard/tests/view-models.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeSessionsForSurface } from "../src/api/viewModels.ts";

describe("pet-ready session view models", () => {
  it("summarizes sessions without React component dependencies", () => {
    const summary = summarizeSessionsForSurface([
      { current_status: "running", latest_event_type: "tool.started", session_name: "Build", summary: null, session_id: "s1" },
      { current_status: "waiting_user", latest_event_type: "permission.requested", session_name: null, summary: "Needs approval", session_id: "s2" },
    ]);

    assert.deepEqual(summary.counts, {
      running: 1,
      stale: 0,
      failed: 0,
      waiting: 1,
    });
    assert.equal(summary.latest?.label, "Build");
    assert.equal(summary.latest?.eventType, "tool.started");
  });
});
```

- [ ] **Step 2: Implement pure view-model helpers**

Export `summarizeSessionsForSurface(sessions)` from `dashboard/src/api/viewModels.ts`. It must not import React.

- [ ] **Step 3: Use helper in `FloatingHUD`**

Replace component-local counting logic with `summarizeSessionsForSurface`. Keep the rendered UI unchanged.

- [ ] **Step 4: Verify**

Run:

```bash
cd dashboard && node --test --experimental-strip-types tests/view-models.test.ts
cd dashboard && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/api/viewModels.ts dashboard/tests/view-models.test.ts dashboard/src/components/FloatingHUD.tsx
git commit -m "feat: add pet-ready dashboard view models"
```

## Completion Audit

The full decoupling goal is complete only when these are true and verified:

- Agent clients can set server URL and optional token without editing hook commands.
- Empty token maps to the server `default` user.
- Known tokens isolate dashboard and ingest data by user.
- Unknown tokens are rejected.
- The React/Tauri dashboard queries a configured server URL directly, with token.
- Dashboard runtime APIs can be reused by a future pet surface without importing React components.
- Local and LAN deployment commands are documented.
- Server, adapter, dashboard tests pass.
