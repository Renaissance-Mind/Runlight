import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_SERVER_URL = "https://runlight.renaissancemind.ai";
export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_PORT = 18767;
export const DEFAULT_LOCAL_SERVER_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_SERVER_PORT = 18765;
export const DEFAULT_DASHBOARD_HOST = "127.0.0.1";
export const DEFAULT_DASHBOARD_PORT = 18766;

export function resolveHome(env = process.env) {
  return path.resolve(env.RUNLIGHT_HOME || path.join(os.homedir(), ".runlight"));
}

export function resolvePaths(env = process.env) {
  const home = resolveHome(env);
  const queue = path.join(home, "queue");
  return {
    home,
    config: path.join(home, "config.json"),
    state: path.join(home, "state.json"),
    pid: path.join(home, "runlight.pid"),
    serverPid: path.join(home, "runlight-server.pid"),
    dashboardPid: path.join(home, "runlight-dashboard.pid"),
    localServerData: path.join(home, "local-server.json"),
    logs: path.join(home, "logs"),
    pending: path.join(queue, "pending"),
    failed: path.join(queue, "failed"),
  };
}

export async function ensureRuntimeDirs(paths) {
  await fs.mkdir(paths.home, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.pending, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.failed, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.logs, { recursive: true, mode: 0o700 });
}

export function localDaemonUrl(config) {
  const daemon = config.daemon || {};
  const host = daemon.host || DEFAULT_DAEMON_HOST;
  const port = daemon.port || DEFAULT_DAEMON_PORT;
  return `http://${host}:${port}`;
}
