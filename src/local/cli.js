import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { createDashboardServer } from "./dashboard.js";
import { installLaunchAgent, queryDaemon, runDaemon, startDaemon, stopDaemon } from "./daemon.js";
import { createLocalServer } from "./local-server.js";
import {
  findAvailablePort,
  normalizeListenPort,
  startManagedDashboard,
  startManagedServer,
  stopManagedPidFile,
} from "./managed.js";
import { clearUploadToken, loadConfig, loadOrCreateConfig, normalizeServerUrl, redactConfig, updateConfig } from "./config.js";
import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DASHBOARD_PORT,
  DEFAULT_LOCAL_SERVER_PORT,
  DEFAULT_SERVER_URL,
  localDaemonUrl,
  resolvePaths,
} from "./paths.js";
import {
  installAgentPlugin,
  pluginStatus,
  SUPPORTED_PLUGIN_TARGETS,
  uninstallAgentPlugin,
} from "./plugins.js";
import { postHookInput, readStdin } from "./hook.js";
import { isSupportedAgentSource, normalizeAgentSource } from "./agent-registry.js";
import { confirm, intro, note, openUrl, outro, promptSecret, promptText, select } from "./prompts.js";
import { packageSpecFromOptions, runUpgradePlan } from "./upgrade.js";
import {
  buildLocalConfigPatch,
  buildSelfHostedClientConfigPatch,
  normalizeSelfHostedServerUrl,
  setupModeFromOptions,
} from "./setup-plan.js";

function printHelp() {
  console.log(`Runlight local CLI

Usage:
  runlight setup [--token <token>] [--server <url>]
  runlight setup --local
  runlight setup --cloud
  runlight setup --self-hosted [--role <server|client|both>]
  runlight login [--server <url>] [--token <token>]
  runlight logout [--json] [--keep-hooks] [--keep-daemon]
  runlight upgrade [--version <version>] [--no-plugins] [--no-daemon-restart]
  runlight status [--json]
  runlight health [--json]
  runlight setting
  runlight plugin <agent|all> [--uninstall]
  runlight daemon <run|start|stop|restart|install>
  runlight server <run|start|stop>
  runlight dashboard <run|start|stop>
  runlight hook <agent>

Environment:
  RUNLIGHT_HOME          Override local config directory
  RUNLIGHT_SERVER_URL    Default server URL
  RUNLIGHT_TOKEN         Default upload token
  RUNLIGHT_DAEMON_PORT   Default local daemon port

Aliases:
  runlight onboarding
  runlight install
`);
}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (rawValue !== undefined) {
      opts[key] = rawValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      opts[key] = argv[i + 1];
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return { positional, opts };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function runVersion() {
  const pkg = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
  return pkg.version;
}

function localIPv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeCliConnectCode() {
  return `rl_cli_${crypto.randomBytes(24).toString("base64url")}`;
}

export function buildCliConnectUrl(serverUrl, code) {
  const url = new URL(`${normalizeServerUrl(serverUrl)}/connect`);
  url.searchParams.set("cli_code", code);
  return url.toString();
}

async function fetchConnectToken(serverUrl, code) {
  const url = `${normalizeServerUrl(serverUrl)}/api/connect/cli/${encodeURIComponent(code)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.trim().slice(0, 80).replace(/\s+/g, " ");
      throw new Error(`Connect endpoint returned non-JSON response at ${url}: ${preview}`);
    }
  }

  if (response.status === 202 || data.status === "pending") return null;
  if (!response.ok) {
    const detail = typeof data === "object" && data !== null && typeof data.detail === "string"
      ? data.detail
      : response.statusText;
    throw new Error(`Connect endpoint ${response.status}: ${detail}`);
  }
  if (data.status !== "complete" || typeof data.token !== "string" || !data.token.trim()) {
    throw new Error("Connect endpoint returned an invalid completion payload");
  }
  return data.token.trim();
}

export async function waitForCliConnectToken(serverUrl, code, {
  timeoutMs = 180000,
  intervalMs = 1000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const token = await fetchConnectToken(serverUrl, code);
    if (token) return token;
    await sleep(intervalMs);
  }
  return null;
}

async function browserLoginToken(serverUrl, opts = {}) {
  const code = makeCliConnectCode();
  const url = buildCliConnectUrl(serverUrl, code);
  note("Browser setup", [
    "The browser page will sign you in and connect this terminal automatically.",
    opts.noOpen ? `Open this URL: ${url}` : "Opening the Runlight connect page now.",
  ]);
  if (!opts.noOpen) openUrl(url);
  note("Waiting for browser", [
    "Finish sign-in in the browser.",
    "This terminal will continue automatically when the page says OK.",
  ]);
  return waitForCliConnectToken(serverUrl, code);
}

async function healthPayload(response, expectedService) {
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: response.status,
      body: text,
      error: "Expected JSON health response",
    };
  }
  const serviceMatches = !expectedService || data.service === expectedService;
  return {
    ok: response.ok && data.status === "ok" && serviceMatches,
    status: response.status,
    body: text,
    ...(serviceMatches ? {} : { error: `Expected service ${expectedService}, got ${data.service || "unknown"}` }),
  };
}

async function serverHealth(serverUrl, token) {
  const health = await fetch(`${serverUrl}/api/health`);
  const result = {
    public: await healthPayload(health, "runlight"),
    ingest: null,
  };
  if (token) {
    const ingest = await fetch(`${serverUrl}/api/ingest/health`, {
      headers: { authorization: `Bearer ${token}` },
    });
    result.ingest = await healthPayload(ingest, "runlight-ingest");
  }
  return result;
}

async function runLogin(opts) {
  const current = await loadOrCreateConfig();
  const serverUrl = normalizeServerUrl(opts.server || current.server_url || DEFAULT_SERVER_URL);
  let token = String(opts.token || "").trim();
  intro("Runlight Login");
  note("Dashboard", [`Server: ${serverUrl}`]);
  if (!token && await confirm("Open Runlight connect page in your browser?", { defaultValue: true })) {
    token = await browserLoginToken(serverUrl, opts);
  }
  if (!token) {
    note("Manual fallback", [
      `Open ${serverUrl}/connect, create an upload token, and paste it here.`,
    ]);
    token = await promptSecret("Upload token from browser");
  }
  if (!token) throw new Error("Upload token is required");
  const config = await updateConfig({ server_url: serverUrl, upload_token: token });
  outro(`Saved Runlight credentials in ${resolvePaths().config}`);
  return config;
}

async function stopDaemonIfRunning() {
  try {
    return await stopDaemon();
  } catch (error) {
    return { stopped: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function stopManagedIfRunning(pidPath) {
  try {
    return await stopManagedPidFile(pidPath);
  } catch (error) {
    return { stopped: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function runLogout(opts) {
  if (!opts.json) intro("Runlight Logout");
  const hooks = opts.keepHooks ? { skipped: true } : await uninstallPlugin("all");
  const daemon = opts.keepDaemon ? { skipped: true } : await stopDaemonIfRunning();
  const paths = resolvePaths();
  const server = opts.keepServer ? { skipped: true } : await stopManagedIfRunning(paths.serverPid);
  const dashboard = opts.keepDashboard ? { skipped: true } : await stopManagedIfRunning(paths.dashboardPid);
  const config = await clearUploadToken();
  const payload = { config: redactConfig(config), daemon, server, dashboard, hooks };
  if (opts.json) {
    printJson(payload);
    return payload;
  }
  note("Signed out", [
    "Upload token removed from local config.",
    opts.keepHooks ? "Local hooks left installed." : "Local agent hooks removed.",
    opts.keepDaemon ? "Daemon left running." : daemon.stopped ? "Daemon stopped." : "Daemon was not running.",
    opts.keepServer ? "Local server left running." : server.stopped ? "Local server stopped." : "Local server was not running.",
    opts.keepDashboard ? "Dashboard left running." : dashboard.stopped ? "Dashboard stopped." : "Dashboard was not running.",
  ]);
  outro("Run `runlight setup` to connect this machine again.");
  return payload;
}

async function runHealth(opts) {
  const config = await loadConfig();
  const local = {};
  try {
    const response = await fetch(`${localDaemonUrl(config)}/health`);
    local.ok = response.ok;
    local.status = response.status;
    local.body = await response.text();
  } catch (error) {
    local.ok = false;
    local.error = error instanceof Error ? error.message : String(error);
  }

  const remote = {};
  try {
    Object.assign(remote, await serverHealth(config.server_url, config.upload_token));
  } catch (error) {
    remote.ok = false;
    remote.error = error instanceof Error ? error.message : String(error);
  }

  const payload = { local, remote, config: redactConfig(config) };
  if (opts.json) {
    printJson(payload);
    return payload;
  }
  console.log(`Local daemon: ${local.ok ? "ok" : "unreachable"}`);
  console.log(`Server:       ${remote.public?.ok ? "ok" : "unreachable"}`);
  if (remote.ingest) console.log(`Token:        ${remote.ingest.ok ? "accepted" : `rejected (${remote.ingest.status})`}`);
  else console.log("Token:        not configured");
  return payload;
}

function formatAgeSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  if (minutes < 60) return secs ? `${minutes}m ${secs}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

async function runStatus(opts) {
  const config = await loadConfig();
  let daemon = null;
  try {
    daemon = await queryDaemon("/status");
  } catch (error) {
    daemon = { status: "unreachable", error: error instanceof Error ? error.message : String(error) };
  }
  const plugins = await pluginStatus();
  const payload = { config: redactConfig(config), daemon, plugins };
  if (opts.json) {
    printJson(payload);
    return payload;
  }
  console.log(`Server URL:   ${config.server_url}`);
  console.log(`Token:        ${config.upload_token ? "configured" : "missing"}`);
  console.log(`Daemon:       ${daemon.status === "ok" ? "running" : "unreachable"}`);
  if (config.managed?.server?.enabled) {
    console.log(`Server:       managed at http://${config.managed.server.host}:${config.managed.server.port}`);
  }
  if (config.managed?.dashboard?.enabled) {
    console.log(`Dashboard:    managed at http://${config.managed.dashboard.host}:${config.managed.dashboard.port}`);
  }
  if (daemon.pending_count !== undefined) {
    const age = formatAgeSeconds(daemon.queue?.queue_oldest_age_seconds);
    console.log(`Queue:        ${daemon.pending_count} pending${age ? ` (oldest ${age})` : ""}`);
  }
  if (daemon.state?.upload_status) {
    const parts = [daemon.state.upload_status];
    if (daemon.state.last_upload_count !== undefined) parts.push(`last ${daemon.state.last_upload_count} event(s)`);
    if (daemon.state.last_upload_duration_ms !== undefined) parts.push(`${daemon.state.last_upload_duration_ms}ms`);
    console.log(`Upload:       ${parts.join(", ")}`);
    if (daemon.state.upload_error) console.log(`Upload error: ${daemon.state.upload_error}`);
  }
  const installedHooks = Object.entries(plugins)
    .filter(([, value]) => value.installed)
    .map(([agent]) => agent);
  console.log(`Agent hooks:  ${installedHooks.length ? installedHooks.join(", ") : "not installed"}`);
  return payload;
}

async function installPlugin(target, opts) {
  const command = opts.command ? String(opts.command) : undefined;
  if (target === "all") {
    const results = {};
    for (const agent of SUPPORTED_PLUGIN_TARGETS) {
      results[agent] = await installAgentPlugin(agent, { command: command?.replace(/\b(codex|claude)\b/g, agent) });
    }
    return results;
  }
  if (SUPPORTED_PLUGIN_TARGETS.includes(normalizeAgentSource(target))) {
    return installAgentPlugin(target, { command });
  }
  throw new Error(`Plugin target must be one of: all, ${SUPPORTED_PLUGIN_TARGETS.join(", ")}`);
}

async function uninstallPlugin(target) {
  if (target === "all") {
    const results = {};
    for (const agent of SUPPORTED_PLUGIN_TARGETS) {
      results[agent] = await uninstallAgentPlugin(agent);
    }
    return results;
  }
  if (SUPPORTED_PLUGIN_TARGETS.includes(normalizeAgentSource(target))) {
    return uninstallAgentPlugin(target);
  }
  throw new Error(`Plugin target must be one of: all, ${SUPPORTED_PLUGIN_TARGETS.join(", ")}`);
}

function setupTargetFromOptions(opts) {
  if (opts.noPlugins) return "skip";
  if (opts.codexOnly) return "codex";
  if (opts.claudeOnly) return "claude";
  return String(opts.plugins || "all");
}

async function runPlugin(positional, opts) {
  const target = positional[1] || "all";
  const result = opts.uninstall ? await uninstallPlugin(target) : await installPlugin(target, opts);
  printJson(result);
  return result;
}

async function restartDaemonForUpgrade() {
  const stopped = await stopDaemonIfRunning();
  const started = await startDaemon();
  return { stopped, started };
}

async function runUpgrade(opts) {
  const target = setupTargetFromOptions(opts);
  const packageSpec = packageSpecFromOptions(opts);
  if (!opts.json) {
    intro("Runlight Upgrade");
    note("Package", [
      `Installing ${packageSpec} globally.`,
      target === "skip" ? "Agent hooks will not be changed." : `Agent hooks will be refreshed: ${target}.`,
      opts.noDaemonRestart || opts.noRestart ? "Daemon restart disabled." : "Local daemon will restart after the package upgrade.",
    ]);
  }

  const result = await runUpgradePlan(
    { ...opts, plugins: target },
    {
      installHooks: (plugins) => installPlugin(plugins, {}),
      restartDaemon: restartDaemonForUpgrade,
    },
  );

  if (opts.json) {
    printJson(result);
    return result;
  }

  note("Upgrade result", [
    result.install.skipped ? `Dry run: ${result.install.command} ${result.install.args.join(" ")}` : "Package upgrade completed.",
    result.hooks.skipped ? "Agent hooks were skipped." : "Agent hooks refreshed.",
    result.daemon.skipped ? "Daemon restart skipped." : "Daemon restarted.",
  ]);
  outro("Run `runlight --version` to confirm the installed version.");
  return result;
}

async function runDaemonCommand(positional) {
  const action = positional[1] || "start";
  if (action === "run") return runDaemon();
  if (action === "start") {
    const result = await startDaemon();
    printJson(result);
    return result;
  }
  if (action === "stop") {
    const result = await stopDaemon();
    printJson(result);
    return result;
  }
  if (action === "restart") {
    try {
      await stopDaemon();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("ENOENT") && !message.includes("ESRCH")) throw error;
    }
    const result = await startDaemon();
    printJson(result);
    return result;
  }
  if (action === "install") {
    const result = await installLaunchAgent();
    printJson(result);
    return result;
  }
  throw new Error(`Unknown daemon action: ${action}`);
}

async function runServerCommand(positional, opts) {
  const action = positional[1] || "start";
  const host = String(opts.host || "127.0.0.1");
  const port = normalizeListenPort(opts.port, DEFAULT_LOCAL_SERVER_PORT);
  if (action === "run") {
    const server = await createLocalServer({ host, port });
    console.log(`Runlight local server listening on http://${host}:${port}`);
    await new Promise((resolve) => {
      const stop = async () => {
        await server.close();
        resolve();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    return;
  }
  if (action === "start") {
    const result = await startManagedServer({ host, port });
    printJson(result);
    return result;
  }
  if (action === "stop") {
    const result = await stopManagedIfRunning(resolvePaths().serverPid);
    printJson(result);
    return result;
  }
  throw new Error(`Unknown server action: ${action}`);
}

async function runDashboardCommand(positional, opts) {
  const action = positional[1] || "start";
  const host = String(opts.host || "127.0.0.1");
  const port = normalizeListenPort(opts.port, DEFAULT_DASHBOARD_PORT);
  const serverUrl = normalizeServerUrl(opts.server || opts.serverUrl || "http://127.0.0.1:18765");
  if (action === "run") {
    const dashboard = await createDashboardServer({ host, port, serverUrl });
    console.log(`Runlight dashboard listening on http://${host}:${port}`);
    await new Promise((resolve) => {
      const stop = async () => {
        await dashboard.close();
        resolve();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    return;
  }
  if (action === "start") {
    const result = await startManagedDashboard({ host, port, serverUrl });
    printJson(result);
    return result;
  }
  if (action === "stop") {
    const result = await stopManagedIfRunning(resolvePaths().dashboardPid);
    printJson(result);
    return result;
  }
  throw new Error(`Unknown dashboard action: ${action}`);
}

async function runSetting(positional) {
  if (positional[1] === "set") {
    const key = positional[2];
    const value = positional[3];
    if (!key || value === undefined) throw new Error("Usage: runlight setting set <server-url|token|daemon-port> <value>");
    if (key === "server-url") return updateConfig({ server_url: value });
    if (key === "token") return updateConfig({ upload_token: value });
    if (key === "daemon-port") return updateConfig({ daemon: { port: Number(value) } });
    throw new Error(`Unknown setting key: ${key}`);
  }

  intro("Runlight Settings");
  let done = false;
  while (!done) {
    const choice = await select("Choose a setting", [
      { value: "server", label: "Server URL", hint: "Cloudflare Worker or self-hosted server" },
      { value: "token", label: "Upload token", hint: "Generated from the browser connect page" },
      { value: "port", label: "Daemon port", hint: "Local 127.0.0.1 listener" },
      { value: "plugins", label: "Install plugins", hint: "Agent hooks" },
      { value: "show", label: "Show config path" },
      { value: "exit", label: "Exit" },
    ]);
    const config = await loadOrCreateConfig();
    if (choice === "server") {
      const value = await promptText("Server URL", { defaultValue: config.server_url });
      await updateConfig({ server_url: value });
    } else if (choice === "token") {
      const value = await promptSecret("Upload token");
      await updateConfig({ upload_token: value });
    } else if (choice === "port") {
      const value = await promptText("Daemon port", { defaultValue: String(config.daemon.port) });
      await updateConfig({ daemon: { port: Number(value) } });
    } else if (choice === "plugins") {
      const target = await select("Install hooks", [
        { value: "all", label: "All known agents" },
        { value: "codex", label: "Codex only" },
        { value: "claude", label: "Claude only" },
      ]);
      await installPlugin(target, {});
    } else if (choice === "show") {
      note("Config", [resolvePaths().config]);
    } else {
      done = true;
    }
  }
}

function printCodexTrustNotice() {
  note("Codex one-time approval", [
    "Open a new Codex session after setup.",
    "When Codex says hooks need review, choose Trust all and continue.",
    "This is Codex's own safety confirmation; Runlight does not bypass it.",
  ]);
}

async function runSetup(opts = {}) {
  intro("Runlight Setup");
  note("What this does", [
    "Connects this machine to a Runlight server.",
    "Starts the required local services.",
    "Installs local agent hooks when this machine is a client.",
  ]);
  const explicitMode = setupModeFromOptions(opts);
  const mode = explicitMode || await select("Choose setup mode", [
    { value: "cloud", label: "Runlight Cloud", hint: "Use the hosted dashboard" },
    { value: "local", label: "Local only", hint: "Run server, dashboard, and daemon on this machine" },
    { value: "self-hosted", label: "Self-hosted", hint: "Connect to or host your own Runlight server" },
  ]);
  if (mode === "local") return runLocalSetup(opts);
  if (mode === "self-hosted") return runSelfHostedSetup(opts);
  return runCloudSetup(opts);
}

async function runCloudSetup(opts = {}) {
  const current = await loadOrCreateConfig();
  const serverUrl = normalizeServerUrl(opts.server || current.server_url || DEFAULT_SERVER_URL);
  let token = String(opts.token || current.upload_token || "").trim();
  note("Dashboard", [`Server: ${serverUrl}`]);
  if (!token) {
    token = await browserLoginToken(serverUrl, opts);
  }
  if (!token) {
    note("Manual fallback", [
      `Open ${serverUrl}/connect, create an upload token, and paste it here.`,
    ]);
    token = await promptSecret("Upload token from browser");
  }
  if (!token) throw new Error("Upload token is required");
  await updateConfig({ server_url: serverUrl, upload_token: token });
  const daemon = await startDaemon();
  const target = setupTargetFromOptions(opts);
  if (target !== "skip") await installPlugin(target, {});
  if (target === "all" || target === "codex") printCodexTrustNotice();
  outro("Runlight is ready. Run `runlight status` any time to check it.");
  return { serverUrl, daemon, plugins: target };
}

async function runLocalSetup(opts = {}) {
  const serverHost = "127.0.0.1";
  const dashboardHost = "127.0.0.1";
  const daemonHost = "127.0.0.1";
  const serverPort = await findAvailablePort(normalizeListenPort(opts.serverPort, DEFAULT_LOCAL_SERVER_PORT), serverHost);
  const dashboardPort = await findAvailablePort(normalizeListenPort(opts.dashboardPort, DEFAULT_DASHBOARD_PORT), dashboardHost, [serverPort]);
  const daemonPort = await findAvailablePort(normalizeListenPort(opts.daemonPort, DEFAULT_DAEMON_PORT), daemonHost, [serverPort, dashboardPort]);
  const patch = buildLocalConfigPatch({ serverHost, serverPort, dashboardHost, dashboardPort, daemonHost, daemonPort });
  await updateConfig(patch);

  note("Local services", [
    `Server: http://${serverHost}:${serverPort}`,
    `Dashboard: http://${dashboardHost}:${dashboardPort}`,
    `Daemon: http://${daemonHost}:${daemonPort}`,
  ]);
  const server = await startManagedServer({ host: serverHost, port: serverPort });
  const dashboard = await startManagedDashboard({ host: dashboardHost, port: dashboardPort, serverUrl: patch.server_url });
  const daemon = await startDaemon();
  const target = setupTargetFromOptions(opts);
  if (target !== "skip") await installPlugin(target, {});
  if (!opts.noOpen) openUrl(`http://${dashboardHost}:${dashboardPort}`);
  if (target === "all" || target === "codex") printCodexTrustNotice();
  outro("Runlight local setup is ready. Run `runlight status` any time to check it.");
  return { server, dashboard, daemon, plugins: target, serverUrl: patch.server_url };
}

async function chooseSelfHostedRole(opts) {
  const role = String(opts.role || opts.selfHostedRole || "").trim();
  if (["server", "client", "both"].includes(role)) return role;
  return select("What should this machine run?", [
    { value: "server", label: "Server", hint: "Host Runlight server and dashboard here" },
    { value: "client", label: "Client", hint: "Send this machine's agent events to an existing server" },
    { value: "both", label: "Both", hint: "Host the server and monitor this same machine" },
  ]);
}

async function runSelfHostedSetup(opts = {}) {
  const role = await chooseSelfHostedRole(opts);
  if (role === "client") return runSelfHostedClientSetup(opts);
  if (role === "server") return runSelfHostedServerSetup(opts, { includeClient: false });
  return runSelfHostedServerSetup(opts, { includeClient: true });
}

async function runSelfHostedClientSetup(opts = {}) {
  const defaultAddress = opts.server || opts.serverUrl || "127.0.0.1:18765";
  const address = opts.server || opts.serverUrl || await promptText("Server address", { defaultValue: defaultAddress });
  const serverUrl = normalizeSelfHostedServerUrl(address, DEFAULT_LOCAL_SERVER_PORT);
  const daemonPort = await findAvailablePort(normalizeListenPort(opts.daemonPort, DEFAULT_DAEMON_PORT), "127.0.0.1");
  const token = String(opts.token || "").trim();
  await updateConfig(buildSelfHostedClientConfigPatch({ serverUrl, token, daemonPort }));
  note("Self-hosted client", [`Server: ${serverUrl}`, `Daemon: http://127.0.0.1:${daemonPort}`]);
  const daemon = await startDaemon();
  const target = setupTargetFromOptions(opts);
  if (target !== "skip") await installPlugin(target, {});
  if (target === "all" || target === "codex") printCodexTrustNotice();
  outro("Runlight self-hosted client is ready.");
  return { serverUrl, daemon, plugins: target };
}

async function runSelfHostedServerSetup(opts = {}, { includeClient = false } = {}) {
  const bindHost = String(opts.host || "0.0.0.0");
  const dashboardHost = String(opts.dashboardHost || "0.0.0.0");
  const preferredServerPort = opts.port || opts.serverPort || await promptText("Server port", { defaultValue: String(DEFAULT_LOCAL_SERVER_PORT) });
  const serverPort = await findAvailablePort(normalizeListenPort(preferredServerPort, DEFAULT_LOCAL_SERVER_PORT), bindHost);
  const dashboardPort = await findAvailablePort(normalizeListenPort(opts.dashboardPort, DEFAULT_DASHBOARD_PORT), dashboardHost, [serverPort]);
  const lanHost = localIPv4();
  const serverUrl = `http://${includeClient ? lanHost : "127.0.0.1"}:${serverPort}`;

  const server = await startManagedServer({ host: bindHost, port: serverPort });
  const dashboard = await startManagedDashboard({
    host: dashboardHost,
    port: dashboardPort,
    serverUrl: `http://${lanHost}:${serverPort}`,
  });

  let daemon = null;
  let target = "skip";
  if (includeClient) {
    const daemonPort = await findAvailablePort(normalizeListenPort(opts.daemonPort, DEFAULT_DAEMON_PORT), "127.0.0.1", [serverPort, dashboardPort]);
    await updateConfig({
      server_url: `http://${lanHost}:${serverPort}`,
      upload_token: "",
      daemon: {
        host: "127.0.0.1",
        port: daemonPort,
      },
      managed: {
        server: { enabled: true, host: bindHost, port: serverPort },
        dashboard: { enabled: true, host: dashboardHost, port: dashboardPort },
      },
    });
    daemon = await startDaemon();
    target = setupTargetFromOptions(opts);
    if (target !== "skip") await installPlugin(target, {});
    if (target === "all" || target === "codex") printCodexTrustNotice();
  } else {
    await updateConfig({
      server_url: `http://127.0.0.1:${serverPort}`,
      upload_token: "",
      managed: {
        server: { enabled: true, host: bindHost, port: serverPort },
        dashboard: { enabled: true, host: dashboardHost, port: dashboardPort },
      },
    });
  }

  note("Self-hosted server", [
    `Server bind: ${bindHost}:${serverPort}`,
    `Server URL for clients on this network: http://${lanHost}:${serverPort}`,
    `Dashboard: http://${lanHost}:${dashboardPort}`,
  ]);
  if (!opts.noOpen) openUrl(`http://127.0.0.1:${dashboardPort}`);
  outro(includeClient ? "Runlight self-hosted server and client are ready." : "Runlight self-hosted server is ready.");
  return { server, dashboard, daemon, plugins: target, serverUrl };
}

async function runHook(positional) {
  const agent = normalizeAgentSource(positional[1]);
  if (!isSupportedAgentSource(agent)) throw new Error("Usage: runlight hook <agent>");
  const input = await readStdin();
  const result = await postHookInput(agent, input);
  if (result.hookResponse) process.stdout.write(result.hookResponse);
}

export async function main(argv) {
  const { positional, opts } = parseArgs(argv);
  const command = positional[0];
  if (command === "version" || (!command && opts.version)) return runVersion();
  if (!command || command === "help" || opts.help) {
    printHelp();
    return;
  }
  if (command === "setup" || command === "install" || command === "onboarding" || command === "onboard") return runSetup(opts);
  if (command === "login") return runLogin(opts);
  if (command === "logout") return runLogout(opts);
  if (command === "upgrade") return runUpgrade(opts);
  if (command === "status") return runStatus(opts);
  if (command === "health") return runHealth(opts);
  if (command === "setting" || command === "settings") return runSetting(positional);
  if (command === "plugin") return runPlugin(positional, opts);
  if (command === "daemon") return runDaemonCommand(positional);
  if (command === "server") return runServerCommand(positional, opts);
  if (command === "dashboard") return runDashboardCommand(positional, opts);
  if (command === "hook") return runHook(positional);
  if (command === "config-path") {
    await fs.mkdir(resolvePaths().home, { recursive: true });
    console.log(resolvePaths().config);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
