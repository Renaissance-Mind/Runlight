import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureRuntimeDirs, resolvePaths } from "./paths.js";

export function normalizeListenPort(value, defaultPort) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number(defaultPort);
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(preferredPort, host = "127.0.0.1", reservedPorts = []) {
  let port = Number(preferredPort);
  const reserved = new Set(reservedPorts.map((value) => Number(value)));
  while (port <= 65535) {
    if (!reserved.has(port) && await canListen(port, host)) return port;
    port += 1;
  }
  throw new Error(`No available port at or above ${preferredPort}`);
}

async function waitForHttp(url, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function startDetached({
  name,
  args,
  env = process.env,
  healthUrl,
  pidPath,
  logName,
}) {
  if (healthUrl) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return { started: false, alreadyRunning: true, url: healthUrl };
    } catch {
      // Component is not reachable yet; start it below.
    }
  }

  const paths = resolvePaths(env);
  await ensureRuntimeDirs(paths);
  const cliPath = fileURLToPath(new URL("../../bin/runlight.js", import.meta.url));
  const out = fsSync.openSync(path.join(paths.logs, `${logName}.log`), "a");
  const err = fsSync.openSync(path.join(paths.logs, `${logName}.err.log`), "a");
  const child = spawn(process.execPath, [cliPath, ...args], {
    detached: true,
    env,
    stdio: ["ignore", out, err],
  });
  child.unref();
  await fs.writeFile(pidPath, `${child.pid}\n`, { mode: 0o600 });
  if (healthUrl) await waitForHttp(healthUrl);
  return { started: true, pid: child.pid, name, url: healthUrl || null };
}

export async function startManagedServer({
  env = process.env,
  host = "127.0.0.1",
  port = 18765,
} = {}) {
  const paths = resolvePaths(env);
  const healthHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${healthHost}:${port}`;
  return startDetached({
    name: "server",
    args: ["server", "run", "--host", host, "--port", String(port)],
    env,
    healthUrl: `${url}/api/health`,
    pidPath: paths.serverPid,
    logName: "server",
  });
}

export async function startManagedDashboard({
  env = process.env,
  host = "127.0.0.1",
  port = 18766,
  serverUrl,
} = {}) {
  const paths = resolvePaths(env);
  const healthHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${healthHost}:${port}`;
  const args = ["dashboard", "run", "--host", host, "--port", String(port)];
  if (serverUrl) args.push("--server", serverUrl);
  return startDetached({
    name: "dashboard",
    args,
    env,
    healthUrl: url,
    pidPath: paths.dashboardPid,
    logName: "dashboard",
  });
}

export async function stopManagedPidFile(pidPath) {
  const raw = await fs.readFile(pidPath, "utf8");
  const pid = Number(raw.trim());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error(`Invalid pid file: ${pidPath}`);
  process.kill(pid, "SIGTERM");
  return { stopped: true, pid };
}
