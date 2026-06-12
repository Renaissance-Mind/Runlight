import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { ensureRuntimeDirs, resolvePaths } from "./paths.js";

const COMPLETION_EVENT_TYPES = new Set([
  "message.finished",
  "session.completed",
  "session.failed",
  "session.aborted",
]);

const RUNNING_STATUSES = new Set([
  "starting",
  "running",
  "tool_running",
  "command_running",
  "waiting_user",
  "waiting_external",
]);

const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "system",
  updated_at: null,
};

function parseUTC(iso) {
  return new Date(String(iso || "").endsWith("Z") ? iso : `${iso}Z`).getTime();
}

function inferStatus(latestEventType, lastHeartbeatAt, terminalResult, lastEventAt, heartbeatStaleSeconds = 120) {
  if (terminalResult) return terminalResult;
  if (latestEventType === "session.completed") return "completed";
  if (latestEventType === "session.failed") return "failed";
  if (latestEventType === "session.aborted") return "aborted";
  if (latestEventType === "user_input.waiting" || latestEventType === "permission.requested") return "waiting_user";
  if (latestEventType === "external.waiting") return "waiting_external";
  if (latestEventType === "message.finished") return "finished";

  const staleRef = lastHeartbeatAt || lastEventAt;
  if (staleRef) {
    const age = (Date.now() - parseUTC(staleRef)) / 1000;
    if (age > heartbeatStaleSeconds) {
      if (lastHeartbeatAt || String(latestEventType || "").endsWith(".started")) return "stale";
      return "finished";
    }
  }

  if (latestEventType === "session.started" && !lastHeartbeatAt) return "starting";
  if (latestEventType && latestEventType !== "session.started") return "running";
  if (lastHeartbeatAt) return "running";
  return "starting";
}

function authUserId(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) return "default";
  return `token:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}

function corsHeaders(req) {
  const origin = req.headers.origin || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    vary: "Origin",
  };
}

function jsonResponse(req, res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJsonRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeEvents(body) {
  if (Array.isArray(body?.events)) return body.events;
  return [body];
}

async function readStore(paths) {
  try {
    const parsed = JSON.parse(await fs.readFile(paths.localServerData, "utf8"));
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      user_settings: parsed.user_settings && typeof parsed.user_settings === "object" ? parsed.user_settings : {},
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { events: [], sessions: {}, user_settings: {}, tokens: [] };
    }
    throw error;
  }
}

async function writeStore(paths, store) {
  await ensureRuntimeDirs(paths);
  const tmp = `${paths.localServerData}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, paths.localServerData);
  await fs.chmod(paths.localServerData, 0o600);
}

function eventToStored(event, userId) {
  const eventTime = event.event_time || new Date().toISOString();
  return {
    event_id: event.event_id || crypto.randomUUID(),
    session_id: String(event.session_id || ""),
    session_name: event.session_name || null,
    session_pin: Boolean(event.session_pin),
    user_id: userId,
    agent_type: event.agent_type || "unknown",
    adapter_name: event.adapter_name || "unknown",
    adapter_version: event.adapter_version || null,
    event_type: event.event_type || "event.unknown",
    event_time: eventTime,
    received_time: event.received_time || new Date().toISOString(),
    sequence: event.sequence ?? null,
    severity: event.severity || "info",
    summary: event.summary || null,
    machine_hostname: event.machine?.hostname || null,
    workspace_cwd: event.workspace?.cwd || null,
    workspace_project_name: event.workspace?.project_name || null,
    payload: event.payload || null,
    dedupe_key: event.dedupe_key || null,
    machine: event.machine || null,
    workspace: event.workspace || null,
  };
}

function upsertSession(store, event) {
  const current = store.sessions[event.session_id];
  const previousStatus = current?.current_status || "starting";
  const terminalResult = event.event_type === "session.completed"
    ? "completed"
    : event.event_type === "session.failed"
      ? "failed"
      : event.event_type === "session.aborted"
        ? "aborted"
        : null;
  const lastHeartbeatAt = event.event_type === "session.heartbeat"
    ? event.event_time
    : current?.last_heartbeat_at || null;
  const nextStatus = inferStatus(event.event_type, lastHeartbeatAt, terminalResult, event.event_time);
  const summary = event.event_type === "session.summary.updated" && event.summary
    ? event.summary
    : current?.summary || event.summary || null;

  store.sessions[event.session_id] = {
    session_id: event.session_id,
    session_name: event.session_name || current?.session_name || null,
    session_pin: Boolean(event.session_pin || current?.session_pin),
    user_id: event.user_id,
    agent_type: event.agent_type,
    adapter_name: event.adapter_name,
    adapter_version: event.adapter_version,
    summary,
    summary_inferred: Boolean(summary && event.event_type !== "session.summary.updated"),
    machine_hostname: event.machine?.hostname || event.machine_hostname || current?.machine_hostname || null,
    machine_os: event.machine?.os || current?.machine_os || null,
    machine_arch: event.machine?.arch || current?.machine_arch || null,
    machine_user: event.machine?.user || current?.machine_user || null,
    machine_id: event.machine?.machine_id || current?.machine_id || null,
    workspace_cwd: event.workspace?.cwd || event.workspace_cwd || current?.workspace_cwd || null,
    workspace_repo_root: event.workspace?.repo_root || current?.workspace_repo_root || null,
    workspace_git_branch: event.workspace?.git_branch || current?.workspace_git_branch || null,
    workspace_git_commit: event.workspace?.git_commit || current?.workspace_git_commit || null,
    workspace_project_name: event.workspace?.project_name || event.workspace_project_name || current?.workspace_project_name || null,
    current_status: nextStatus,
    latest_event_type: event.event_type,
    started_at: current?.started_at || event.event_time,
    last_event_at: event.event_time,
    last_heartbeat_at: lastHeartbeatAt,
    event_count: Number(current?.event_count || 0) + 1,
    terminal_result: terminalResult,
    current_run_started_at: RUNNING_STATUSES.has(nextStatus) && !RUNNING_STATUSES.has(previousStatus)
      ? event.event_time
      : current?.current_run_started_at || null,
  };
  return store.sessions[event.session_id];
}

function sessionToJson(session) {
  return {
    session_id: session.session_id,
    session_name: session.session_name,
    session_pin: Boolean(session.session_pin),
    user_id: session.user_id,
    agent_type: session.agent_type,
    adapter_name: session.adapter_name,
    adapter_version: session.adapter_version,
    summary: session.summary,
    summary_inferred: Boolean(session.summary_inferred),
    machine_hostname: session.machine_hostname,
    machine_os: session.machine_os,
    workspace_cwd: session.workspace_cwd,
    workspace_git_branch: session.workspace_git_branch,
    workspace_project_name: session.workspace_project_name,
    current_status: session.current_status,
    latest_event_type: session.latest_event_type,
    started_at: session.started_at,
    last_event_at: session.last_event_at,
    last_heartbeat_at: session.last_heartbeat_at,
    event_count: session.event_count,
    terminal_result: session.terminal_result,
    current_run_started_at: session.current_run_started_at,
  };
}

function eventToJson(event, store) {
  return {
    event_id: event.event_id,
    session_id: event.session_id,
    session_name: event.session_name,
    session_pin: Boolean(event.session_pin),
    agent_type: event.agent_type,
    event_type: event.event_type,
    event_time: event.event_time,
    received_time: event.received_time,
    severity: event.severity,
    summary: event.summary,
    machine_hostname: event.machine_hostname,
    workspace_cwd: event.workspace_cwd,
    workspace_project_name: event.workspace_project_name || store.sessions[event.session_id]?.workspace_project_name || null,
    payload: event.payload,
  };
}

function sortDescByTime(a, b) {
  return parseUTC(b.last_event_at || b.event_time || "") - parseUTC(a.last_event_at || a.event_time || "");
}

function tokenPreview(token) {
  if (token.length <= 16) return token;
  return `${token.slice(0, 11)}...${token.slice(-4)}`;
}

export async function createLocalServer({
  env = process.env,
  host = "127.0.0.1",
  port = 18765,
} = {}) {
  const paths = resolvePaths(env);
  await ensureRuntimeDirs(paths);

  async function handleRequest(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const userId = authUserId(req);

    if (req.method === "GET" && url.pathname === "/api/health") {
      jsonResponse(req, res, 200, { status: "ok", service: "runlight" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/ingest/health") {
      jsonResponse(req, res, 200, { status: "ok", service: "runlight-ingest", user_id: userId });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/users/current") {
      jsonResponse(req, res, 200, { user_id: userId });
      return;
    }

    const store = await readStore(paths);

    if (req.method === "POST" && url.pathname === "/api/events") {
      const body = await readJsonRequest(req);
      const storedEvents = normalizeEvents(body).map((event) => eventToStored(event, userId));
      for (const event of storedEvents) {
        if (event.dedupe_key && store.events.some((existing) => existing.dedupe_key === event.dedupe_key)) {
          continue;
        }
        store.events.push(event);
        upsertSession(store, event);
      }
      await writeStore(paths, store);
      const results = storedEvents.map((event) => ({
        event_id: event.event_id,
        session_id: event.session_id,
        status: store.sessions[event.session_id]?.current_status || "starting",
      }));
      jsonResponse(req, res, 200, body?.events ? { events: results } : results[0]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sessions/live") {
      const sessions = Object.values(store.sessions)
        .filter((session) => session.user_id === userId)
        .filter((session) => !["completed", "failed", "aborted"].includes(session.current_status) || session.session_pin)
        .sort(sortDescByTime)
        .map(sessionToJson);
      jsonResponse(req, res, 200, { sessions });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
      const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
      const agentType = url.searchParams.get("agent_type");
      const status = url.searchParams.get("status");
      const sessions = Object.values(store.sessions)
        .filter((session) => session.user_id === userId)
        .filter((session) => !agentType || session.agent_type === agentType)
        .filter((session) => !status || session.current_status === status)
        .sort((a, b) => parseUTC(b.started_at || "") - parseUTC(a.started_at || ""))
        .slice(offset, offset + limit)
        .map(sessionToJson);
      jsonResponse(req, res, 200, { sessions });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events/recent") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
      const completionsOnly = url.searchParams.get("completions_only") !== "false";
      const events = store.events
        .filter((event) => event.user_id === userId)
        .filter((event) => !completionsOnly || COMPLETION_EVENT_TYPES.has(event.event_type))
        .sort((a, b) => parseUTC(b.event_time || "") - parseUTC(a.event_time || ""))
        .slice(0, limit)
        .map((event) => eventToJson(event, store));
      jsonResponse(req, res, 200, { events });
      return;
    }

    const sessionEventsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (req.method === "GET" && sessionEventsMatch) {
      const sessionId = decodeURIComponent(sessionEventsMatch[1]);
      const session = store.sessions[sessionId];
      if (!session || session.user_id !== userId) {
        jsonResponse(req, res, 404, { detail: "Session not found" });
        return;
      }
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 1000);
      const events = store.events
        .filter((event) => event.session_id === sessionId && event.user_id === userId)
        .sort((a, b) => parseUTC(a.event_time || "") - parseUTC(b.event_time || ""))
        .slice(0, limit)
        .map((event) => eventToJson(event, store));
      jsonResponse(req, res, 200, { events });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const session = store.sessions[sessionId];
      if (!session || session.user_id !== userId) {
        jsonResponse(req, res, 404, { detail: "Session not found" });
        return;
      }
      if (req.method === "GET") {
        jsonResponse(req, res, 200, sessionToJson(session));
        return;
      }
      if (req.method === "DELETE") {
        delete store.sessions[sessionId];
        store.events = store.events.filter((event) => event.session_id !== sessionId);
        await writeStore(paths, store);
        jsonResponse(req, res, 200, { deleted: sessionId });
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/user-settings") {
      jsonResponse(req, res, 200, { settings: store.user_settings[userId] || DEFAULT_SETTINGS });
      return;
    }
    if (req.method === "PATCH" && url.pathname === "/api/user-settings") {
      const body = await readJsonRequest(req);
      const theme = ["dark", "light", "system"].includes(body.theme) ? body.theme : DEFAULT_SETTINGS.theme;
      const language = ["system", "en", "zh-CN"].includes(body.language) ? body.language : DEFAULT_SETTINGS.language;
      store.user_settings[userId] = { theme, language, updated_at: new Date().toISOString() };
      await writeStore(paths, store);
      jsonResponse(req, res, 200, { settings: store.user_settings[userId] });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tokens") {
      jsonResponse(req, res, 200, {
        tokens: store.tokens
          .filter((token) => token.user_id === userId)
          .map((token) => ({ id: token.id, token_preview: tokenPreview(token.token_value), created_at: token.created_at })),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/tokens") {
      const token = `rl_tok_${crypto.randomBytes(24).toString("base64url")}`;
      const created = {
        id: Date.now(),
        user_id: userId,
        token,
        token_value: token,
        token_preview: tokenPreview(token),
        created_at: new Date().toISOString(),
      };
      store.tokens.push(created);
      await writeStore(paths, store);
      jsonResponse(req, res, 201, { token: created });
      return;
    }

    jsonResponse(req, res, 404, { detail: "API route not found" });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      jsonResponse(req, res, 500, { detail: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  async function close() {
    await new Promise((resolve) => server.close(resolve));
  }

  return { server, close, paths };
}
