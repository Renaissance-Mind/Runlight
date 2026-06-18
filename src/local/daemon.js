import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, loadOrCreateConfig, redactConfig } from "./config.js";
import { enrichRawHookEvents, shouldIgnoreUnpersistedCodexStartup } from "./enrich.js";
import { ensureRuntimeDirs, localDaemonUrl, resolvePaths } from "./paths.js";

const MAX_BATCH_EVENTS = 200;
const MAX_DRAIN_BATCHES = 25;
const UPLOAD_ATTEMPTS = 2;
const UPLOAD_RETRY_DELAY_MS = 750;

function jsonResponse(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
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

function requestHasLocalSecret(req, config) {
  const header = req.headers["x-runlight-local-secret"];
  if (header === config.local_secret) return true;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${config.local_secret}`;
}

function normalizeEvents(body) {
  if (Array.isArray(body?.events)) return body.events;
  return [body];
}

function normalizeRawHookEvents(body) {
  if (Array.isArray(body?.events)) return body.events;
  return [body];
}

function validateEvent(event) {
  if (!event || typeof event !== "object") throw new Error("event must be an object");
  for (const key of ["session_id", "agent_type", "adapter_name", "event_type", "event_time"]) {
    if (!String(event[key] || "").trim()) throw new Error(`event missing ${key}`);
  }
}

async function readState(paths) {
  try {
    return JSON.parse(await fs.readFile(paths.state, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeState(paths, patch) {
  const current = await readState(paths);
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const tmp = `${paths.state}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, paths.state);
  await fs.chmod(paths.state, 0o600);
  return next;
}

function parseTimeMs(value) {
  if (!value) return null;
  const ms = new Date(String(value).endsWith("Z") ? value : `${value}Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pendingQueueStats(paths, nowMs = Date.now()) {
  await ensureRuntimeDirs(paths);
  const files = (await fs.readdir(paths.pending)).filter((name) => name.endsWith(".json")).sort();
  const stats = {
    pending_count: files.length,
    queue_oldest_queued_at: null,
    queue_oldest_event_at: null,
    queue_oldest_age_seconds: null,
  };
  if (files.length === 0) return stats;

  const payload = JSON.parse(await fs.readFile(path.join(paths.pending, files[0]), "utf8"));
  const events = normalizeEvents(payload);
  stats.queue_oldest_queued_at = payload.queued_at || null;
  stats.queue_oldest_event_at = events[0]?.event_time || null;
  const oldestMs = parseTimeMs(stats.queue_oldest_queued_at) ?? parseTimeMs(stats.queue_oldest_event_at);
  if (oldestMs !== null) {
    stats.queue_oldest_age_seconds = Math.max(0, Math.round((nowMs - oldestMs) / 1000));
  }
  return stats;
}

async function writeStateWithQueueStats(paths, patch) {
  const stats = await pendingQueueStats(paths);
  return writeState(paths, { ...stats, ...patch });
}

export async function countPending(paths) {
  return (await pendingQueueStats(paths)).pending_count;
}

export async function enqueueEvents(paths, events) {
  await ensureRuntimeDirs(paths);
  let count = 0;
  for (const event of events) {
    validateEvent(event);
    const id = `${Date.now()}-${process.pid}-${count}-${Math.random().toString(16).slice(2)}`;
    const file = path.join(paths.pending, `${id}.json`);
    await fs.writeFile(file, `${JSON.stringify({ events: [event], queued_at: new Date().toISOString() })}\n`, {
      mode: 0o600,
    });
    count += 1;
  }
  return { count: events.length };
}

async function readPendingBatch(paths, maxEvents = MAX_BATCH_EVENTS) {
  await ensureRuntimeDirs(paths);
  const names = (await fs.readdir(paths.pending)).filter((name) => name.endsWith(".json")).sort();
  const files = [];
  const events = [];
  for (const name of names) {
    if (events.length >= maxEvents) break;
    const file = path.join(paths.pending, name);
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    const nextEvents = normalizeEvents(payload);
    files.push(file);
    for (const event of nextEvents) {
      if (events.length < maxEvents) events.push(event);
    }
  }
  return { files, events };
}

async function moveFailed(paths, files) {
  await ensureRuntimeDirs(paths);
  for (const file of files) {
    const target = path.join(paths.failed, path.basename(file));
    await fs.rename(file, target);
  }
}

async function unlinkIfExists(file) {
  try {
    await fs.unlink(file);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function uploadEventBatch({ config, events, fetchImpl }) {
  const headers = {
    "content-type": "application/json",
  };
  if (config.upload_token) {
    headers.authorization = `Bearer ${config.upload_token}`;
  }

  let lastError = "";
  let lastDurationMs = 0;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    let response;
    try {
      response = await fetchImpl(`${config.server_url}/api/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      lastDurationMs = Date.now() - startedAt;
      const detail = error instanceof Error ? error.message : String(error);
      lastError = `Upload failed: ${detail.slice(0, 240)}`;
      if (attempt < UPLOAD_ATTEMPTS) await sleep(UPLOAD_RETRY_DELAY_MS * attempt);
      continue;
    }

    lastDurationMs = Date.now() - startedAt;
    if (response.ok) {
      return { ok: true, attempts: attempt, duration_ms: lastDurationMs };
    }

    const detail = await response.text();
    lastError = `HTTP ${response.status}: ${detail.slice(0, 240)}`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= UPLOAD_ATTEMPTS) {
      return { ok: false, attempts: attempt, duration_ms: lastDurationMs, error: lastError };
    }
    await sleep(UPLOAD_RETRY_DELAY_MS * attempt);
  }

  return { ok: false, attempts: UPLOAD_ATTEMPTS, duration_ms: lastDurationMs, error: lastError };
}

export async function flushPending({ config, paths, fetchImpl = fetch } = {}) {
  const pending = await countPending(paths);
  if (pending === 0) {
    return writeStateWithQueueStats(paths, { upload_status: "idle", pending_count: 0 });
  }

  const batch = await readPendingBatch(paths);
  if (batch.events.length === 0) {
    return writeStateWithQueueStats(paths, { upload_status: "idle", pending_count: pending });
  }

  await writeStateWithQueueStats(paths, {
    upload_status: "uploading",
    upload_error: "",
    upload_started_at: new Date().toISOString(),
    upload_batch_count: batch.events.length,
  });

  const upload = await uploadEventBatch({ config, events: batch.events, fetchImpl });
  if (!upload.ok) {
    return writeStateWithQueueStats(paths, {
      upload_status: "error",
      upload_error: upload.error || "Upload failed",
      last_upload_duration_ms: upload.duration_ms,
      last_upload_attempts: upload.attempts,
      pending_count: pending,
    });
  }

  for (const file of batch.files) await unlinkIfExists(file);
  const nextPending = await countPending(paths);
  return writeStateWithQueueStats(paths, {
    upload_status: "ok",
    upload_error: "",
    last_upload_at: new Date().toISOString(),
    last_upload_count: batch.events.length,
    last_upload_duration_ms: upload.duration_ms,
    last_upload_attempts: upload.attempts,
    pending_count: nextPending,
  });
}

export async function drainPending({ config, paths, fetchImpl = fetch, maxBatches = MAX_DRAIN_BATCHES } = {}) {
  let batches = 0;
  let events = 0;
  let state = await writeStateWithQueueStats(paths, {
    flush_started_at: new Date().toISOString(),
  });

  if ((await countPending(paths)) === 0) {
    return writeStateWithQueueStats(paths, {
      upload_status: "idle",
      flush_finished_at: new Date().toISOString(),
      last_flush_batch_count: 0,
      last_flush_event_count: 0,
    });
  }

  while (batches < maxBatches) {
    if ((await countPending(paths)) === 0) break;
    state = await flushPending({ config, paths, fetchImpl });
    if (state.upload_status !== "ok") break;
    batches += 1;
    events += Number(state.last_upload_count || 0);
  }

  return writeStateWithQueueStats(paths, {
    upload_status: state.upload_status === "ok" && state.pending_count === 0 ? "idle" : state.upload_status,
    flush_finished_at: new Date().toISOString(),
    last_flush_batch_count: batches,
    last_flush_event_count: events,
  });
}

export async function createDaemonServer({ env = process.env, fetchImpl = fetch } = {}) {
  const paths = resolvePaths(env);
  const config = await loadOrCreateConfig(env);
  await ensureRuntimeDirs(paths);
  await writeState(paths, {
    daemon_status: "starting",
    daemon_pid: process.pid,
    daemon_started_at: new Date().toISOString(),
  });

  let flushTimer = null;
  let flushPromise = null;
  let flushRequested = false;
  const ignoredRawCodexSessions = new Set();

  async function scheduleFlush() {
    if (flushPromise) {
      flushRequested = true;
      return flushPromise;
    }
    flushPromise = (async () => {
      let finalState = null;
      try {
        do {
          flushRequested = false;
          const freshConfig = await loadConfig(env);
          const state = await drainPending({ config: freshConfig, paths, fetchImpl });
          finalState = state;
          if (state.upload_status === "error") break;
        } while (flushRequested);
      } finally {
        flushPromise = null;
      }
      return finalState;
    })();
    return flushPromise;
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, { status: "ok", service: "runlight-daemon", pid: process.pid });
      return;
    }

    const freshConfig = await loadConfig(env);
    if (!requestHasLocalSecret(req, freshConfig)) {
      jsonResponse(res, 401, { detail: "Local daemon authentication required" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/status") {
      const state = await readState(paths);
      const queue = await pendingQueueStats(paths);
      jsonResponse(res, 200, {
        status: "ok",
        service: "runlight-daemon",
        config: redactConfig(freshConfig),
        pending_count: queue.pending_count,
        queue,
        state,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/events") {
      const body = await readJsonRequest(req);
      const events = normalizeEvents(body);
      const queued = await enqueueEvents(paths, events);
      scheduleFlush();
      jsonResponse(res, 202, { status: "queued", count: queued.count, pending_count: await countPending(paths) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/events/raw") {
      const body = await readJsonRequest(req);
      const rawEvents = normalizeRawHookEvents(body);
      const acceptedRawEvents = [];
      let ignoredCount = 0;

      for (const raw of rawEvents) {
        const input = raw?.input || {};
        const sessionId = input.session_id || "";
        if (raw?.agent === "codex" && sessionId && ignoredRawCodexSessions.has(sessionId)) {
          ignoredCount += 1;
          continue;
        }

        if (raw?.agent === "codex" && await shouldIgnoreUnpersistedCodexStartup(input, env)) {
          ignoredRawCodexSessions.add(sessionId);
          ignoredCount += 1;
          continue;
        }

        acceptedRawEvents.push(raw);
      }

      const events = await enrichRawHookEvents(acceptedRawEvents, freshConfig, env);
      if (events.length === 0) {
        jsonResponse(res, 202, { status: "ignored", count: 0, ignored_count: ignoredCount, pending_count: await countPending(paths) });
        return;
      }
      const queued = await enqueueEvents(paths, events);
      scheduleFlush();
      jsonResponse(res, 202, { status: "queued", count: queued.count, ignored_count: ignoredCount, pending_count: await countPending(paths) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/flush") {
      const state = await scheduleFlush();
      jsonResponse(res, 200, { status: "ok", state });
      return;
    }

    jsonResponse(res, 404, { detail: "Not found" });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      jsonResponse(res, 500, {
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  });

  server.on("clientError", (_err, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.daemon.port, config.daemon.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  await listen();
  await fs.writeFile(paths.pid, `${process.pid}\n`, { mode: 0o600 });
  await writeState(paths, { daemon_status: "running", daemon_pid: process.pid });
  flushTimer = setInterval(scheduleFlush, 5_000);
  scheduleFlush();

  async function close() {
    if (flushTimer) clearInterval(flushTimer);
    if (flushPromise) await flushPromise.catch(() => null);
    await new Promise((resolve) => server.close(resolve));
    await writeState(paths, { daemon_status: "stopped" });
  }

  return { server, close, flush: scheduleFlush, config, paths };
}

export async function runDaemon({ env = process.env, stdout = process.stdout } = {}) {
  const daemon = await createDaemonServer({ env });
  stdout.write(`Runlight daemon listening on ${localDaemonUrl(daemon.config)}\n`);
  await new Promise((resolve) => {
    const stop = async () => {
      await daemon.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

export async function queryDaemon(pathname, { method = "GET", body, env = process.env } = {}) {
  const config = await loadConfig(env);
  const response = await fetch(`${localDaemonUrl(config)}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-runlight-local-secret": config.local_secret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`daemon ${pathname} failed with HTTP ${response.status}`);
  return response.json();
}

export async function startDaemon({ env = process.env } = {}) {
  const config = await loadOrCreateConfig(env);
  const daemonUrl = localDaemonUrl(config);
  try {
    const health = await fetch(`${daemonUrl}/health`);
    if (health.ok) return { started: false, alreadyRunning: true };
  } catch {
    // The daemon is not reachable yet; continue with a background start.
  }

  const paths = resolvePaths(env);
  await ensureRuntimeDirs(paths);
  const cliPath = fileURLToPath(new URL("../../bin/runlight.js", import.meta.url));
  const out = fsSync.openSync(path.join(paths.logs, "daemon.log"), "a");
  const err = fsSync.openSync(path.join(paths.logs, "daemon.err.log"), "a");
  const child = spawn(process.execPath, [cliPath, "daemon", "run"], {
    detached: true,
    env,
    stdio: ["ignore", out, err],
  });
  child.unref();
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${daemonUrl}/health`);
      if (health.ok) return { started: true, pid: child.pid };
      lastError = new Error(`HTTP ${health.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Runlight daemon: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function stopDaemon({ env = process.env } = {}) {
  const paths = resolvePaths(env);
  const raw = await fs.readFile(paths.pid, "utf8");
  const pid = Number(raw.trim());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("Invalid daemon pid file");
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error && error.code === "ESRCH") return { stopped: true, pid };
      throw error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Runlight daemon ${pid} to stop`);
}

export async function installLaunchAgent({ env = process.env } = {}) {
  if (process.platform !== "darwin") {
    throw new Error("runlight daemon install currently supports macOS LaunchAgents only");
  }
  const paths = resolvePaths(env);
  await ensureRuntimeDirs(paths);
  const cliPath = fileURLToPath(new URL("../../bin/runlight.js", import.meta.url));
  const plistDir = path.join(process.env.HOME || "", "Library", "LaunchAgents");
  const plistPath = path.join(plistDir, "ai.runlight.daemon.plist");
  await fs.mkdir(plistDir, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.runlight.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${cliPath}</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUNLIGHT_HOME</key><string>${paths.home}</string>
  </dict>
  <key>StandardOutPath</key><string>${path.join(paths.logs, "launchd.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(paths.logs, "launchd.err.log")}</string>
</dict>
</plist>
`;
  await fs.writeFile(plistPath, plist, { mode: 0o644 });
  return { plistPath };
}

export async function movePendingToFailed({ env = process.env } = {}) {
  const paths = resolvePaths(env);
  const names = (await fs.readdir(paths.pending)).filter((name) => name.endsWith(".json"));
  await moveFailed(paths, names.map((name) => path.join(paths.pending, name)));
  return { moved: names.length };
}
