import crypto from "node:crypto";
import fs from "node:fs/promises";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT, DEFAULT_SERVER_URL, ensureRuntimeDirs, resolvePaths } from "./paths.js";

export function normalizeServerUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_SERVER_URL;
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");

  try {
    const url = new URL(withoutTrailingSlash);
    const segments = url.pathname.split("/").filter(Boolean);
    const apiIndex = segments.indexOf("api");
    if (apiIndex >= 0) {
      url.pathname = `/${segments.slice(0, apiIndex).join("/")}`.replace(/\/+$/, "");
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }

    if (
      url.pathname === "/settings"
      || url.pathname === "/messages"
      || url.pathname.startsWith("/sessions/")
    ) {
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return withoutTrailingSlash;
  }

  return withoutTrailingSlash;
}

function generateSecret(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

export function defaultConfig(env = process.env) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    server_url: normalizeServerUrl(env.RUNLIGHT_SERVER_URL || DEFAULT_SERVER_URL),
    upload_token: String(env.RUNLIGHT_TOKEN || "").trim(),
    machine_id: generateSecret("rl_machine"),
    local_secret: generateSecret("rl_local"),
    daemon: {
      host: DEFAULT_DAEMON_HOST,
      port: Number(env.RUNLIGHT_DAEMON_PORT || DEFAULT_DAEMON_PORT),
    },
    created_at: now,
    updated_at: now,
  };
}

export async function loadConfig(env = process.env) {
  const paths = resolvePaths(env);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(paths.config, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return defaultConfig(env);
    throw error;
  }

  const base = defaultConfig(env);
  return {
    ...base,
    ...parsed,
    server_url: normalizeServerUrl(parsed.server_url || base.server_url),
    upload_token: String(parsed.upload_token ?? base.upload_token ?? "").trim(),
    machine_id: parsed.machine_id || base.machine_id,
    local_secret: parsed.local_secret || base.local_secret,
    daemon: {
      ...base.daemon,
      ...(parsed.daemon || {}),
      port: Number(parsed.daemon?.port ?? base.daemon.port),
    },
  };
}

export async function saveConfig(config, env = process.env) {
  const paths = resolvePaths(env);
  await ensureRuntimeDirs(paths);
  const next = {
    ...config,
    server_url: normalizeServerUrl(config.server_url),
    upload_token: String(config.upload_token || "").trim(),
    updated_at: new Date().toISOString(),
  };
  const tmp = `${paths.config}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, paths.config);
  await fs.chmod(paths.config, 0o600);
  return next;
}

export async function loadOrCreateConfig(env = process.env) {
  const paths = resolvePaths(env);
  let config;
  try {
    config = await loadConfig(env);
    await fs.access(paths.config);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  if (!config) config = defaultConfig(env);
  return saveConfig(config, env);
}

export async function updateConfig(patch, env = process.env) {
  const current = await loadOrCreateConfig(env);
  return saveConfig({
    ...current,
    ...patch,
    daemon: {
      ...current.daemon,
      ...(patch.daemon || {}),
    },
  }, env);
}

export function redactConfig(config) {
  return {
    server_url: config.server_url,
    token_configured: Boolean(config.upload_token),
    token_preview: config.upload_token ? `${config.upload_token.slice(0, 10)}...${config.upload_token.slice(-4)}` : "",
    daemon: config.daemon,
    machine_id: config.machine_id,
  };
}
