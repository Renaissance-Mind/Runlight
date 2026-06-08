import { Hono } from "hono";
import type { Env, EventEnvelope, EventBatch } from "../types";
import { resolveUser } from "../auth";
import { inferStatus, nextTerminalResult } from "../status";

export const ingest = new Hono<{ Bindings: Env }>();

function generateId(): string {
  return crypto.randomUUID();
}

function staleSeconds(env: Env): number {
  return parseInt(env.HEARTBEAT_STALE_SECONDS || "120", 10);
}

async function storeEvent(
  db: D1Database,
  envelope: EventEnvelope,
  userId: string,
): Promise<{ eventId: string; inserted: boolean }> {
  const eventId = envelope.event_id || generateId();
  const receivedTime = new Date().toISOString();

  if (envelope.dedupe_key) {
    const existing = await db
      .prepare("SELECT event_id FROM events WHERE dedupe_key = ?")
      .bind(envelope.dedupe_key)
      .first();
    if (existing) return { eventId: existing.event_id as string, inserted: false };
  }

  await db
    .prepare(
      `INSERT INTO events (event_id, session_id, session_name, session_pin, user_id, agent_type,
        adapter_name, adapter_version, event_type, event_time, received_time, sequence, severity,
        summary, machine_hostname, workspace_cwd, payload_json, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      eventId,
      envelope.session_id,
      envelope.session_name ?? null,
      envelope.session_pin ? 1 : 0,
      userId,
      envelope.agent_type,
      envelope.adapter_name,
      envelope.adapter_version ?? null,
      envelope.event_type,
      envelope.event_time,
      receivedTime,
      envelope.sequence ?? null,
      envelope.severity || "info",
      envelope.summary ?? null,
      envelope.machine?.hostname ?? null,
      envelope.workspace?.cwd ?? null,
      envelope.payload ? JSON.stringify(envelope.payload) : null,
      envelope.dedupe_key ?? null,
    )
    .run();

  return { eventId, inserted: true };
}

async function getExistingSessionStatus(
  db: D1Database,
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const existing = await db
    .prepare("SELECT current_status FROM sessions WHERE session_id = ? AND user_id = ?")
    .bind(sessionId, userId)
    .first();
  return (existing?.current_status as string | undefined) ?? null;
}

async function upsertSession(
  db: D1Database,
  envelope: EventEnvelope,
  userId: string,
  staleSec: number,
): Promise<{ sessionId: string; status: string }> {
  const existing = await db
    .prepare("SELECT * FROM sessions WHERE session_id = ?")
    .bind(envelope.session_id)
    .first();

  const now = new Date().toISOString();

  if (!existing) {
    const terminalResult = nextTerminalResult(envelope.event_type);
    const status = inferStatus(
      envelope.event_type,
      null,
      terminalResult,
      envelope.event_time,
      staleSec,
    );

    await db
      .prepare(
        `INSERT INTO sessions (session_id, session_name, session_pin, user_id, agent_type,
          adapter_name, adapter_version, summary, summary_inferred,
          machine_hostname, machine_os, machine_arch, machine_user, machine_id,
          workspace_cwd, workspace_repo_root, workspace_git_branch, workspace_git_commit, workspace_project_name,
          current_status, latest_event_type, started_at, last_event_at, last_heartbeat_at,
          event_count, terminal_result, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        envelope.session_id,
        envelope.session_name ?? null,
        envelope.session_pin ? 1 : 0,
        userId,
        envelope.agent_type,
        envelope.adapter_name,
        envelope.adapter_version ?? null,
        envelope.summary ?? null,
        envelope.summary ? 1 : 0,
        envelope.machine?.hostname ?? null,
        envelope.machine?.os ?? null,
        envelope.machine?.arch ?? null,
        envelope.machine?.user ?? null,
        envelope.machine?.machine_id ?? null,
        envelope.workspace?.cwd ?? null,
        envelope.workspace?.repo_root ?? null,
        envelope.workspace?.git_branch ?? null,
        envelope.workspace?.git_commit ?? null,
        envelope.workspace?.project_name ?? null,
        status,
        envelope.event_type,
        envelope.event_time,
        envelope.event_time,
        envelope.event_type === "session.heartbeat" ? envelope.event_time : null,
        1,
        terminalResult,
        now,
      )
      .run();

    return { sessionId: envelope.session_id, status };
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (envelope.session_name) {
    updates.push("session_name = ?");
    params.push(envelope.session_name);
  }

  updates.push("session_pin = ?");
  params.push(envelope.session_pin ? 1 : 0);

  if (envelope.machine) {
    if (envelope.machine.hostname) { updates.push("machine_hostname = ?"); params.push(envelope.machine.hostname); }
    if (envelope.machine.os) { updates.push("machine_os = ?"); params.push(envelope.machine.os); }
    if (envelope.machine.arch) { updates.push("machine_arch = ?"); params.push(envelope.machine.arch); }
    if (envelope.machine.user) { updates.push("machine_user = ?"); params.push(envelope.machine.user); }
    if (envelope.machine.machine_id) { updates.push("machine_id = ?"); params.push(envelope.machine.machine_id); }
  }

  if (envelope.workspace) {
    if (envelope.workspace.cwd) { updates.push("workspace_cwd = ?"); params.push(envelope.workspace.cwd); }
    if (envelope.workspace.repo_root) { updates.push("workspace_repo_root = ?"); params.push(envelope.workspace.repo_root); }
    if (envelope.workspace.git_branch) { updates.push("workspace_git_branch = ?"); params.push(envelope.workspace.git_branch); }
    if (envelope.workspace.git_commit) { updates.push("workspace_git_commit = ?"); params.push(envelope.workspace.git_commit); }
    if (envelope.workspace.project_name) { updates.push("workspace_project_name = ?"); params.push(envelope.workspace.project_name); }
  }

  if (envelope.event_type === "session.summary.updated" && envelope.summary) {
    updates.push("summary = ?, summary_inferred = 0");
    params.push(envelope.summary);
  } else if (!(existing.summary) && envelope.summary) {
    updates.push("summary = ?, summary_inferred = 1");
    params.push(envelope.summary);
  }

  if (envelope.event_type === "session.heartbeat") {
    updates.push("last_heartbeat_at = ?");
    params.push(envelope.event_time);
  }

  const terminalResult = nextTerminalResult(envelope.event_type);
  updates.push("terminal_result = ?");
  params.push(terminalResult);

  updates.push("latest_event_type = ?");
  params.push(envelope.event_type);

  updates.push("last_event_at = ?");
  params.push(envelope.event_time);

  updates.push("event_count = event_count + 1");

  updates.push("updated_at = ?");
  params.push(now);

  const lastHb = envelope.event_type === "session.heartbeat"
    ? envelope.event_time
    : (existing.last_heartbeat_at as string | null);

  const status = inferStatus(
    envelope.event_type,
    lastHb,
    terminalResult,
    envelope.event_time,
    staleSec,
  );
  updates.push("current_status = ?");
  params.push(status);

  params.push(envelope.session_id);

  await db
    .prepare(`UPDATE sessions SET ${updates.join(", ")} WHERE session_id = ?`)
    .bind(...params)
    .run();

  return { sessionId: envelope.session_id, status };
}

ingest.post("/events", async (c) => {
  let userId: string;
  try {
    userId = resolveUser(c.env, c.req.header("Authorization") ?? null);
  } catch {
    return c.json({ detail: "Unknown token" }, 401);
  }

  const body = await c.req.json();
  const staleSec = staleSeconds(c.env);

  if (Array.isArray(body.events)) {
    const batch = body as EventBatch;
    const results = [];
    for (const envelope of batch.events) {
      const stored = await storeEvent(c.env.DB, envelope, userId);
      if (!stored.inserted) {
        const existingStatus = await getExistingSessionStatus(c.env.DB, envelope.session_id, userId);
        results.push({
          event_id: stored.eventId,
          session_id: envelope.session_id,
          status: existingStatus ?? "starting",
        });
        continue;
      }
      const session = await upsertSession(c.env.DB, envelope, userId, staleSec);
      results.push({ event_id: stored.eventId, session_id: session.sessionId, status: session.status });
    }
    return c.json({ events: results });
  }

  const envelope = body as EventEnvelope;
  const stored = await storeEvent(c.env.DB, envelope, userId);
  if (!stored.inserted) {
    const existingStatus = await getExistingSessionStatus(c.env.DB, envelope.session_id, userId);
    return c.json({
      event_id: stored.eventId,
      session_id: envelope.session_id,
      status: existingStatus ?? "starting",
    });
  }
  const session = await upsertSession(c.env.DB, envelope, userId, staleSec);
  return c.json({ event_id: stored.eventId, session_id: session.sessionId, status: session.status });
});
