import fs from "node:fs/promises";
import { installLaunchAgent, queryDaemon, runDaemon, startDaemon, stopDaemon } from "./daemon.js";
import { loadConfig, loadOrCreateConfig, normalizeServerUrl, redactConfig, updateConfig } from "./config.js";
import { DEFAULT_SERVER_URL, localDaemonUrl, resolvePaths } from "./paths.js";
import { installClaudePlugin, installCodexPlugin, pluginStatus, uninstallClaudePlugin, uninstallCodexPlugin } from "./plugins.js";
import { postHookInput, readStdin } from "./hook.js";
import { confirm, intro, note, openUrl, outro, promptSecret, promptText, select } from "./prompts.js";

function printHelp() {
  console.log(`Runlight local CLI

Usage:
  runlight setup [--token <token>] [--server <url>]
  runlight login [--server <url>] [--token <token>]
  runlight status [--json]
  runlight health [--json]
  runlight setting
  runlight plugin <codex|claude|all> [--uninstall]
  runlight daemon <run|start|stop|restart|install>
  runlight hook <codex|claude>

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
  note("Dashboard", [
    `Server: ${serverUrl}`,
    "Create an upload token from Settings > Upload tokens.",
  ]);
  if (!token && await confirm("Open Runlight settings in your browser?", { defaultValue: true })) {
    openUrl(`${serverUrl}/settings`);
  }
  if (!token) token = await promptSecret("Upload token");
  if (!token) throw new Error("Upload token is required");
  const config = await updateConfig({ server_url: serverUrl, upload_token: token });
  outro(`Saved Runlight credentials in ${resolvePaths().config}`);
  return config;
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
  if (daemon.pending_count !== undefined) console.log(`Queue:        ${daemon.pending_count} pending`);
  console.log(`Codex hook:   ${plugins.codex.installed ? "installed" : "not installed"}`);
  console.log(`Claude hook:  ${plugins.claude.installed ? "installed" : "not installed"}`);
  return payload;
}

async function installPlugin(target, opts) {
  const command = opts.command ? String(opts.command) : undefined;
  if (target === "codex") return installCodexPlugin({ command });
  if (target === "claude") return installClaudePlugin({ command });
  if (target === "all") {
    return {
      codex: await installCodexPlugin({ command: command?.replace(/\bclaude\b/g, "codex") }),
      claude: await installClaudePlugin({ command: command?.replace(/\bcodex\b/g, "claude") }),
    };
  }
  throw new Error("Plugin target must be codex, claude, or all");
}

async function uninstallPlugin(target) {
  if (target === "codex") return uninstallCodexPlugin();
  if (target === "claude") return uninstallClaudePlugin();
  if (target === "all") {
    return {
      codex: await uninstallCodexPlugin(),
      claude: await uninstallClaudePlugin(),
    };
  }
  throw new Error("Plugin target must be codex, claude, or all");
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
    } catch {
      // Restart is allowed when no daemon is running.
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
      { value: "token", label: "Upload token", hint: "Generated from Dashboard Settings" },
      { value: "port", label: "Daemon port", hint: "Local 127.0.0.1 listener" },
      { value: "plugins", label: "Install plugins", hint: "Codex and Claude hooks" },
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
        { value: "all", label: "Codex + Claude" },
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
    "Connects this machine to your Runlight dashboard.",
    "Starts the local daemon.",
    "Installs local Codex and Claude hooks.",
  ]);
  const current = await loadOrCreateConfig();
  const serverUrl = normalizeServerUrl(opts.server || current.server_url || DEFAULT_SERVER_URL);
  note("Dashboard", [`Server: ${serverUrl}`]);
  if (!opts.noOpen) openUrl(`${serverUrl}/settings`);
  let token = String(opts.token || current.upload_token || "").trim();
  if (!token) token = await promptSecret("Paste upload token");
  if (!token) throw new Error("Upload token is required");
  await updateConfig({ server_url: serverUrl, upload_token: token });
  const daemon = await startDaemon();
  const target = setupTargetFromOptions(opts);
  if (target !== "skip") await installPlugin(target, {});
  if (target === "all" || target === "codex") printCodexTrustNotice();
  outro("Runlight is ready. Run `runlight status` any time to check it.");
  return { serverUrl, daemon, plugins: target };
}

async function runHook(positional) {
  const agent = positional[1];
  if (agent !== "codex" && agent !== "claude") throw new Error("Usage: runlight hook <codex|claude>");
  const input = await readStdin();
  await postHookInput(agent, input);
}

export async function main(argv) {
  const { positional, opts } = parseArgs(argv);
  const command = positional[0];
  if (!command || command === "help" || opts.help) {
    printHelp();
    return;
  }
  if (command === "setup" || command === "install" || command === "onboarding" || command === "onboard") return runSetup(opts);
  if (command === "login") return runLogin(opts);
  if (command === "status") return runStatus(opts);
  if (command === "health") return runHealth(opts);
  if (command === "setting" || command === "settings") return runSetting(positional);
  if (command === "plugin") return runPlugin(positional, opts);
  if (command === "daemon") return runDaemonCommand(positional);
  if (command === "hook") return runHook(positional);
  if (command === "config-path") {
    await fs.mkdir(resolvePaths().home, { recursive: true });
    console.log(resolvePaths().config);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
