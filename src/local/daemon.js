import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, loadOrCreateConfig, redactConfig } from "./config.js";
import { ensureRuntimeDirs, localDaemonUrl, resolvePaths } from "./paths.js";

const MAX_BATCH_EVENTS = 50;

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

export async function countPending(paths) {
  await ensureRuntimeDirs(paths);
  const files = await fs.readdir(paths.pending);
  return files.filter((name) => name.endsWith(".json")).length;
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

export async function flushPending({ config, paths, fetchImpl = fetch } = {}) {
  const pending = await countPending(paths);
  if (pending === 0) {
    return writeState(paths, { upload_status: "idle", pending_count: 0 });
  }
  if (!config.upload_token) {
    return writeState(paths, {
      upload_status: "blocked",
      upload_error: "Upload token is not configured",
      pending_count: pending,
    });
  }

  const batch = await readPendingBatch(paths);
  if (batch.events.length === 0) {
    return writeState(paths, { upload_status: "idle", pending_count: pending });
  }

  const response = await fetchImpl(`${config.server_url}/api/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.upload_token}`,
    },
    body: JSON.stringify({ events: batch.events }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return writeState(paths, {
      upload_status: "error",
      upload_error: `HTTP ${response.status}: ${detail.slice(0, 240)}`,
      pending_count: pending,
    });
  }

  for (const file of batch.files) await fs.unlink(file);
  const nextPending = await countPending(paths);
  return writeState(paths, {
    upload_status: "ok",
    upload_error: "",
    last_upload_at: new Date().toISOString(),
    last_upload_count: batch.events.length,
    pending_count: nextPending,
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

  async function scheduleFlush() {
    if (flushPromise) {
      flushRequested = true;
      return flushPromise;
    }
    flushPromise = (async () => {
      try {
        do {
          flushRequested = false;
          const freshConfig = await loadConfig(env);
          await flushPending({ config: freshConfig, paths, fetchImpl });
        } while (flushRequested);
      } finally {
        flushPromise = null;
      }
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
      jsonResponse(res, 200, {
        status: "ok",
        service: "runlight-daemon",
        config: redactConfig(freshConfig),
        pending_count: await countPending(paths),
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

    if (req.method === "POST" && url.pathname === "/flush") {
      const state = await flushPending({ config: freshConfig, paths, fetchImpl });
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
  try {
    const health = await fetch(`${localDaemonUrl(config)}/health`);
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
  return { started: true, pid: child.pid };
}

export async function stopDaemon({ env = process.env } = {}) {
  const paths = resolvePaths(env);
  const raw = await fs.readFile(paths.pid, "utf8");
  const pid = Number(raw.trim());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("Invalid daemon pid file");
  process.kill(pid, "SIGTERM");
  return { stopped: true, pid };
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
