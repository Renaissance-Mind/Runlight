import { Hono } from "hono";
import type { Env, SessionRow } from "../types";
import { resolveRequestUser } from "../auth";
import { inferStatus } from "../status";

export const sessions = new Hono<{ Bindings: Env }>();

const COMPLETION_EVENT_TYPES = [
  "message.finished",
  "session.completed",
  "session.failed",
  "session.aborted",
];

function staleSeconds(env: Env): number {
  return parseInt(env.HEARTBEAT_STALE_SECONDS || "120", 10);
}

function sessionToJson(row: SessionRow) {
  return {
    session_id: row.session_id,
    session_name: row.session_name,
    session_pin: Boolean(row.session_pin),
    user_id: row.user_id,
    agent_type: row.agent_type,
    adapter_name: row.adapter_name,
    adapter_version: row.adapter_version,
    summary: row.summary,
    summary_inferred: Boolean(row.summary_inferred),
    machine_hostname: row.machine_hostname,
    machine_os: row.machine_os,
    machine_arch: row.machine_arch,
    machine_user: row.machine_user,
    machine_id: row.machine_id,
    workspace_cwd: row.workspace_cwd,
    workspace_git_branch: row.workspace_git_branch,
    workspace_project_name: row.workspace_project_name,
    current_status: row.current_status,
    latest_event_type: row.latest_event_type,
    started_at: row.started_at,
    last_event_at: row.last_event_at,
    last_heartbeat_at: row.last_heartbeat_at,
    current_run_started_at: row.current_run_started_at ?? null,
    event_count: row.event_count,
    terminal_result: row.terminal_result,
  };
}

function eventRowToJson(row: Record<string, unknown>) {
  return {
    event_id: row.event_id,
    session_id: row.session_id,
    session_name: row.session_name,
    session_pin: Boolean(row.session_pin),
    agent_type: row.agent_type,
    event_type: row.event_type,
    event_time: row.event_time,
    received_time: row.received_time,
    severity: row.severity,
    summary: row.summary,
    machine_hostname: row.machine_hostname,
    workspace_cwd: row.workspace_cwd,
    workspace_project_name: row.workspace_project_name,
    payload: row.payload_json ? JSON.parse(row.payload_json as string) : null,
  };
}

async function refreshStatuses(db: D1Database, userId: string, staleSec: number) {
  const terminal = ["completed", "failed", "aborted"];
  const result = await db
    .prepare(
      `SELECT id, latest_event_type, last_heartbeat_at, terminal_result, last_event_at, current_status
       FROM sessions WHERE user_id = ? AND current_status NOT IN (?, ?, ?)`,
    )
    .bind(userId, ...terminal)
    .all();

  if (!result.results) return;

  for (const row of result.results) {
    const r = row as Record<string, unknown>;
    const next = inferStatus(
      r.latest_event_type as string | null,
      r.last_heartbeat_at as string | null,
      r.terminal_result as string | null,
      r.last_event_at as string | null,
      staleSec,
    );
    if (next !== r.current_status) {
      await db
        .prepare(`UPDATE sessions SET current_status = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(next, r.id)
        .run();
    }
  }
}

sessions.get("/events/recent", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  await refreshStatuses(c.env.DB, userId, staleSeconds(c.env));

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100", 10), 1), 500);
  const completionsOnly = c.req.query("completions_only") !== "false";
  let sql = `
    SELECT e.event_id, e.session_id, e.session_name, e.session_pin, e.agent_type, e.event_type,
           e.event_time, e.received_time, e.severity, e.summary, e.machine_hostname,
           e.workspace_cwd, e.payload_json, s.workspace_project_name
    FROM events e
    LEFT JOIN sessions s ON e.session_id = s.session_id
    WHERE e.user_id = ?`;
  const params: unknown[] = [userId];

  if (completionsOnly) {
    sql += ` AND e.event_type IN (${COMPLETION_EVENT_TYPES.map(() => "?").join(", ")})`;
    params.push(...COMPLETION_EVENT_TYPES);
  }

  sql += " ORDER BY e.event_time DESC LIMIT ?";
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ events: (result.results || []).map((row) => eventRowToJson(row as Record<string, unknown>)) });
});

sessions.get("/sessions/live", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  await refreshStatuses(c.env.DB, userId, staleSeconds(c.env));

  const result = await c.env.DB.prepare(
    `SELECT * FROM sessions
     WHERE user_id = ? AND (current_status NOT IN ('completed', 'failed', 'aborted') OR session_pin = 1)
     ORDER BY last_event_at DESC`,
  )
    .bind(userId)
    .all<SessionRow>();

  return c.json({ sessions: (result.results || []).map(sessionToJson) });
});

sessions.get("/sessions", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  await refreshStatuses(c.env.DB, userId, staleSeconds(c.env));

  const agentType = c.req.query("agent_type");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = Math.max(parseInt(c.req.query("offset") || "0", 10), 0);

  let sql = "SELECT * FROM sessions WHERE user_id = ?";
  const params: unknown[] = [userId];

  if (agentType) {
    sql += " AND agent_type = ?";
    params.push(agentType);
  }
  if (status) {
    sql += " AND current_status = ?";
    params.push(status);
  }

  sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(sql).bind(...params).all<SessionRow>();
  return c.json({ sessions: (result.results || []).map(sessionToJson) });
});

sessions.get("/sessions/:sessionId", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const sessionId = c.req.param("sessionId");

  await refreshStatuses(c.env.DB, userId, staleSeconds(c.env));

  const result = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE session_id = ? AND user_id = ?",
  )
    .bind(sessionId, userId)
    .first<SessionRow>();

  if (!result) return c.json({ detail: "Session not found" }, 404);
  return c.json(sessionToJson(result));
});

sessions.delete("/sessions/:sessionId", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const sessionId = c.req.param("sessionId");

  const session = await c.env.DB.prepare(
    "SELECT session_id FROM sessions WHERE session_id = ? AND user_id = ?",
  )
    .bind(sessionId, userId)
    .first();

  if (!session) return c.json({ detail: "Session not found" }, 404);

  await c.env.DB.prepare("DELETE FROM events WHERE session_id = ?")
    .bind(sessionId)
    .run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE session_id = ?")
    .bind(sessionId)
    .run();

  return c.json({ deleted: sessionId });
});

sessions.get("/sessions/:sessionId/events", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const sessionId = c.req.param("sessionId");
  const limit = Math.min(parseInt(c.req.query("limit") || "200", 10), 1000);

  const session = await c.env.DB.prepare(
    "SELECT user_id FROM sessions WHERE session_id = ? AND user_id = ?",
  )
    .bind(sessionId, userId)
    .first();

  if (!session) return c.json({ detail: "Session not found" }, 404);

  const result = await c.env.DB.prepare(
    `SELECT event_id, session_id, session_name, session_pin, agent_type, event_type, event_time,
            received_time, severity, summary, machine_hostname, workspace_cwd, payload_json
     FROM events WHERE session_id = ? ORDER BY event_time ASC LIMIT ?`,
  )
    .bind(sessionId, limit)
    .all();

  const events = (result.results || []).map((row) => {
    return eventRowToJson(row as Record<string, unknown>);
  });

  return c.json({ events });
});
