import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODEX_EVENTS = [
  ["SessionStart", 5],
  ["PreToolUse", 3],
  ["PostToolUse", 3],
  ["PostToolUseFailure", 3],
  ["UserPromptSubmit", 3],
  ["Stop", 5],
];

const CLAUDE_EVENTS = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "SessionEnd",
  "Stop",
];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function defaultCommand(agent) {
  const cliPath = fileURLToPath(new URL("../../bin/runlight.js", import.meta.url));
  return `${shellQuote(process.execPath)} ${shellQuote(cliPath)} hook ${agent}`;
}

function commandFor(agent, override) {
  return override || defaultCommand(agent);
}

function codexHome(env) {
  return env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readTextFile(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function enableCodexHooksFeatureToml(input) {
  const lines = String(input || "").split(/\r?\n/);
  const featuresStart = lines.findIndex((line) => /^\s*\[features]\s*$/.test(line));
  if (featuresStart === -1) {
    const prefix = input && !String(input).endsWith("\n") ? "\n\n" : input ? "\n" : "";
    return `${String(input || "")}${prefix}[features]\nhooks = true\n`;
  }

  let sectionEnd = lines.length;
  for (let i = featuresStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[[^\]]+]\s*$/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  for (let i = featuresStart + 1; i < sectionEnd; i += 1) {
    if (/^\s*hooks\s*=/.test(lines[i])) {
      lines[i] = "hooks = true";
      return `${lines.join("\n").replace(/\n*$/, "")}\n`;
    }
  }

  lines.splice(featuresStart + 1, 0, "hooks = true");
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

async function enableCodexHooksFeature({ env = process.env } = {}) {
  const configFile = path.join(codexHome(env), "config.toml");
  const before = await readTextFile(configFile);
  const after = enableCodexHooksFeatureToml(before);
  if (after !== before) {
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, after);
  }
  return { configFile, enabled: true, changed: after !== before };
}

function isRunlightHookCommand(command, agent) {
  const text = String(command || "");
  return new RegExp(`runlight\\s+hook\\s+${agent}`).test(text)
    || new RegExp(`runlight\\.js['"]?\\s+hook\\s+${agent}`).test(text)
    || /runlight-hook\.sh/.test(text)
    || /agent-monitor-hook\.sh/.test(text);
}

function pruneHookEntries(entries, agent) {
  return (entries || [])
    .map((entry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((hook) => !isRunlightHookCommand(hook.command, agent)),
    }))
    .filter((entry) => (entry.hooks || []).length > 0);
}

export async function installCodexPlugin({ env = process.env, command } = {}) {
  const home = codexHome(env);
  const hooksFile = path.join(home, "hooks.json");
  const config = await readJsonFile(hooksFile, { hooks: {} });
  config.hooks ||= {};
  for (const [event, timeout] of CODEX_EVENTS) {
    config.hooks[event] = pruneHookEntries(config.hooks[event], "codex");
    config.hooks[event].push({
      hooks: [{ type: "command", command: commandFor("codex", command), timeout }],
    });
  }
  await writeJsonFile(hooksFile, config);
  const feature = await enableCodexHooksFeature({ env });
  return { hooksFile, configFile: feature.configFile, hooksFeature: feature, events: CODEX_EVENTS.map(([event]) => event), command: commandFor("codex", command) };
}

export async function uninstallCodexPlugin({ env = process.env } = {}) {
  const hooksFile = path.join(codexHome(env), "hooks.json");
  const config = await readJsonFile(hooksFile, { hooks: {} });
  config.hooks ||= {};
  for (const event of Object.keys(config.hooks)) {
    config.hooks[event] = pruneHookEntries(config.hooks[event], "codex");
    if (config.hooks[event].length === 0) delete config.hooks[event];
  }
  await writeJsonFile(hooksFile, config);
  return { hooksFile };
}

export async function installClaudePlugin({ env = process.env, command } = {}) {
  const settingsFile = env.CLAUDE_SETTINGS_FILE || path.join(os.homedir(), ".claude", "settings.json");
  const config = await readJsonFile(settingsFile, {});
  config.hooks ||= {};
  for (const event of CLAUDE_EVENTS) {
    config.hooks[event] = pruneHookEntries(config.hooks[event], "claude");
    config.hooks[event].push({
      hooks: [{ type: "command", command: commandFor("claude", command), timeout: 5, async: true }],
    });
  }
  await writeJsonFile(settingsFile, config);
  return { settingsFile, events: CLAUDE_EVENTS, command: commandFor("claude", command) };
}

export async function uninstallClaudePlugin({ env = process.env } = {}) {
  const settingsFile = env.CLAUDE_SETTINGS_FILE || path.join(os.homedir(), ".claude", "settings.json");
  const config = await readJsonFile(settingsFile, {});
  config.hooks ||= {};
  for (const event of Object.keys(config.hooks)) {
    config.hooks[event] = pruneHookEntries(config.hooks[event], "claude");
    if (config.hooks[event].length === 0) delete config.hooks[event];
  }
  await writeJsonFile(settingsFile, config);
  return { settingsFile };
}

export async function pluginStatus({ env = process.env } = {}) {
  const hooksFile = path.join(codexHome(env), "hooks.json");
  const claudeSettingsFile = env.CLAUDE_SETTINGS_FILE || path.join(os.homedir(), ".claude", "settings.json");
  const codex = await readJsonFile(hooksFile, { hooks: {} });
  const claude = await readJsonFile(claudeSettingsFile, { hooks: {} });
  const codexInstalled = Object.values(codex.hooks || {}).some((entries) =>
    (entries || []).some((entry) => (entry.hooks || []).some((hook) => isRunlightHookCommand(hook.command, "codex"))),
  );
  const claudeInstalled = Object.values(claude.hooks || {}).some((entries) =>
    (entries || []).some((entry) => (entry.hooks || []).some((hook) => isRunlightHookCommand(hook.command, "claude"))),
  );
  return {
    codex: { installed: codexInstalled, hooksFile },
    claude: { installed: claudeInstalled, settingsFile: claudeSettingsFile },
  };
}
