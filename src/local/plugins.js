import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_AGENT_SOURCES, normalizeAgentSource } from "./agent-registry.js";

const CODEX_EVENTS = [
  ["SessionStart", 5, false],
  ["SessionEnd", 5, true],
  ["PreToolUse", 3, false],
  ["PostToolUse", 3, false],
  ["PostToolUseFailure", 3, false],
  ["PermissionRequest", 86400, false],
  ["UserPromptSubmit", 3, false],
  ["Stop", 5, false],
];

const CLAUDE_EVENTS = [
  ["UserPromptSubmit", 5, true],
  ["PreToolUse", 5, false],
  ["PostToolUse", 5, true],
  ["PostToolUseFailure", 5, true],
  ["PermissionRequest", 86400, false],
  ["Notification", 86400, false],
  ["SubagentStart", 5, true],
  ["SubagentStop", 5, true],
  ["SessionStart", 5, false],
  ["SessionEnd", 5, true],
  ["Stop", 5, true],
  ["PreCompact", 5, true],
];

const KIMI_EVENTS = CLAUDE_EVENTS
  .filter(([event]) => event !== "PermissionRequest")
  .map(([event, timeout, asyncHook]) => [event, Math.min(timeout, 600), asyncHook]);

const NESTED_EVENTS = [
  ["SessionStart", 5, false],
  ["SessionEnd", 5, true],
  ["UserPromptSubmit", 5, false],
  ["PreToolUse", 5, false],
  ["PostToolUse", 5, false],
  ["PermissionRequest", 86400, false],
  ["Stop", 5, false],
];

const FLAT_EVENTS = [
  ["beforeSubmitPrompt", 5, false],
  ["beforeShellExecution", 5, false],
  ["afterShellExecution", 5, false],
  ["beforeReadFile", 5, false],
  ["afterFileEdit", 5, false],
  ["beforeMCPExecution", 5, false],
  ["afterMCPExecution", 5, false],
  ["afterAgentThought", 86400, false],
  ["afterAgentResponse", 5, false],
  ["stop", 5, false],
];

export const SUPPORTED_PLUGIN_TARGETS = SUPPORTED_AGENT_SOURCES;

function homeDir(env) {
  return env.HOME || os.homedir();
}

function kimiCodeHome(env) {
  return env.KIMI_CODE_HOME || path.join(homeDir(env), ".kimi-code");
}

const AGENT_PLUGIN_DEFINITIONS = {
  claude: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => env.CLAUDE_SETTINGS_FILE || path.join(homeDir(env), ".claude", "settings.json"), configKey: "hooks" },
  gemini: { format: "nested", events: NESTED_EVENTS, configFile: (env) => path.join(homeDir(env), ".gemini", "settings.json"), configKey: "hooks" },
  cursor: { format: "flat", events: FLAT_EVENTS, configFile: (env) => path.join(homeDir(env), ".cursor", "hooks.json"), configKey: "hooks" },
  "cursor-cli": { format: "flat", events: FLAT_EVENTS, configFile: (env) => path.join(homeDir(env), ".cursor", "hooks.json"), configKey: "hooks" },
  trae: { format: "flat", events: FLAT_EVENTS, configFile: (env) => path.join(homeDir(env), ".trae", "hooks.json"), configKey: "hooks" },
  traecn: { format: "flat", events: FLAT_EVENTS, configFile: (env) => path.join(homeDir(env), ".trae-cn", "hooks.json"), configKey: "hooks" },
  qoder: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".qoder", "settings.json"), configKey: "hooks" },
  "qoder-cli": { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".qoder", "settings.json"), configKey: "hooks" },
  droid: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".factory", "settings.json"), configKey: "hooks" },
  codebuddy: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".codebuddy", "settings.json"), configKey: "hooks" },
  codybuddycn: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".codybuddycn", "settings.json"), configKey: "hooks" },
  stepfun: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".stepfun", "settings.json"), configKey: "hooks" },
  antigravity: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".antigravity", "settings.json"), configKey: "hooks" },
  "google-antigravity": { format: "nested", events: NESTED_EVENTS, configFile: (env) => path.join(homeDir(env), ".gemini", "config", "hooks.json"), configKey: "codeisland" },
  workbuddy: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".workbuddy", "settings.json"), configKey: "hooks" },
  qwen: { format: "claude", events: CLAUDE_EVENTS, configFile: (env) => path.join(homeDir(env), ".qwen", "settings.json"), configKey: "hooks" },
  kimi: { format: "kimi-toml", events: KIMI_EVENTS, configFile: (env) => path.join(kimiCodeHome(env), "config.toml") },
};

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
    .map((entry) => {
      if (Array.isArray(entry.hooks)) {
        return {
          ...entry,
          hooks: entry.hooks.filter((hook) => !isRunlightHookCommand(hook.command, agent)),
        };
      }
      if (entry.command && isRunlightHookCommand(entry.command, agent)) return null;
      return entry;
    })
    .filter((entry) => entry && (!Array.isArray(entry.hooks) || entry.hooks.length > 0));
}

function hookEntryFor(format, agent, event, timeout, asyncHook, command) {
  const hook = { type: "command", command: commandFor(agent, command), timeout };
  if (asyncHook !== undefined) hook.async = Boolean(asyncHook);
  if (format === "flat") {
    return {
      command: commandFor(agent, command),
      timeout,
      async: Boolean(asyncHook),
    };
  }
  return { hooks: [hook] };
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function formatKimiHookEntry(entry) {
  if (entry.raw) return entry.raw.trim();
  const fields = [`event = ${tomlString(entry.event)}`];
  if (entry.matcher !== undefined) fields.push(`matcher = ${tomlString(entry.matcher)}`);
  fields.push(`command = ${tomlString(entry.command)}`);
  if (entry.timeout !== undefined) fields.push(`timeout = ${Number(entry.timeout)}`);
  return `{ ${fields.join(", ")} }`;
}

function formatKimiHooksToml(entries) {
  if (entries.length === 0) return "hooks = []";
  return `hooks = [\n${entries.map((entry) => `  ${formatKimiHookEntry(entry)}`).join(",\n")}\n]`;
}

function topLevelSectionStart(lines) {
  const index = lines.findIndex((line) => /^\s*\[/.test(line));
  return index === -1 ? lines.length : index;
}

function bracketDelta(line, state) {
  let delta = 0;
  let escaped = false;
  for (const char of line) {
    if (state.inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === state.inString) {
        state.inString = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      state.inString = char;
      continue;
    }
    if (char === "#") break;
    if (char === "[") delta += 1;
    if (char === "]") delta -= 1;
  }
  return delta;
}

function findTopLevelHooksArray(input) {
  const text = String(input || "");
  const lines = text.split(/\r?\n/);
  const sectionStart = topLevelSectionStart(lines);
  for (let i = 0; i < sectionStart; i += 1) {
    if (!/^\s*hooks\s*=/.test(lines[i])) continue;
    const collected = [lines[i]];
    const state = { inString: "" };
    let depth = bracketDelta(lines[i], state);
    let end = i + 1;
    while (depth > 0 && end < lines.length) {
      collected.push(lines[end]);
      depth += bracketDelta(lines[end], state);
      end += 1;
    }
    if (depth !== 0) throw new Error("Kimi config has an unterminated top-level hooks array.");
    return { start: i, end, text: collected.join("\n") };
  }
  return null;
}

function splitTomlInlineTables(arrayText) {
  const start = arrayText.indexOf("[");
  const end = arrayText.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("Kimi hooks must be a TOML array.");
  const body = arrayText.slice(start + 1, end);
  const tables = [];
  let current = "";
  let depth = 0;
  let inString = "";
  let escaped = false;

  for (const char of body) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      current += char;
      if (depth === 0) {
        tables.push(current.trim());
        current = "";
      }
      continue;
    }
    if (depth > 0) current += char;
  }

  if (depth !== 0 || inString) throw new Error("Kimi hooks contains an incomplete inline table.");
  const trailing = current.replace(/[,\s]/g, "");
  if (trailing.length > 0) throw new Error("Kimi hooks must use inline table entries.");
  return tables;
}

function splitTomlInlineFields(tableText) {
  const inner = tableText.trim().replace(/^\{/, "").replace(/\}$/, "");
  const fields = [];
  let current = "";
  let inString = "";
  let escaped = false;

  for (const char of inner) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }
    if (char === ",") {
      if (current.trim()) fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

function parseTomlValue(value) {
  const text = value.trim();
  if (/^".*"$/.test(text)) return JSON.parse(text);
  if (/^'.*'$/.test(text)) return text.slice(1, -1);
  if (/^\d+$/.test(text)) return Number(text);
  if (text === "true") return true;
  if (text === "false") return false;
  return text;
}

function parseKimiHooksToml(arrayText) {
  return splitTomlInlineTables(arrayText).map((raw) => {
    const parsed = { raw };
    for (const field of splitTomlInlineFields(raw)) {
      const separator = field.indexOf("=");
      if (separator === -1) continue;
      parsed[field.slice(0, separator).trim()] = parseTomlValue(field.slice(separator + 1));
    }
    return parsed;
  });
}

function insertOrReplaceTopLevelHooksToml(input, entries) {
  const text = String(input || "");
  const replacement = formatKimiHooksToml(entries);
  if (text.trim() === "") return `${replacement}\n`;
  const range = findTopLevelHooksArray(text);
  const lines = text.split(/\r?\n/);
  if (range) {
    lines.splice(range.start, range.end - range.start, replacement);
    return `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }

  const insertAt = topLevelSectionStart(lines);
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  if (before.length > 0 && before[before.length - 1].trim() !== "") before.push("");
  before.push(replacement);
  if (after.length > 0 && after[0].trim() !== "") before.push("");
  return `${before.concat(after).join("\n").replace(/\n*$/, "")}\n`;
}

function upsertKimiRunlightHooksToml(input, agent, definition, command) {
  const range = findTopLevelHooksArray(input);
  const existing = range ? parseKimiHooksToml(range.text).filter((entry) => !isRunlightHookCommand(entry.command, agent)) : [];
  const runlightEntries = definition.events.map(([event, timeout]) => ({
    event,
    command: commandFor(agent, command),
    timeout,
  }));
  return insertOrReplaceTopLevelHooksToml(input, [...existing, ...runlightEntries]);
}

function removeKimiRunlightHooksToml(input, agent) {
  const range = findTopLevelHooksArray(input);
  if (!range) return String(input || "");
  const existing = parseKimiHooksToml(range.text).filter((entry) => !isRunlightHookCommand(entry.command, agent));
  return insertOrReplaceTopLevelHooksToml(input, existing);
}

async function installKimiTomlHookPlugin(agent, definition, { env = process.env, command } = {}) {
  const configFile = definition.configFile(env);
  const before = await readTextFile(configFile);
  const after = upsertKimiRunlightHooksToml(before, agent, definition, command);
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, after);
  return { configFile, events: definition.events.map(([event]) => event), command: commandFor(agent, command) };
}

async function uninstallKimiTomlHookPlugin(agent, definition, { env = process.env } = {}) {
  const configFile = definition.configFile(env);
  const before = await readTextFile(configFile);
  const after = removeKimiRunlightHooksToml(before, agent);
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, after);
  return { configFile };
}

async function isKimiTomlHookInstalled(agent, definition, { env = process.env } = {}) {
  const configFile = definition.configFile(env);
  const text = await readTextFile(configFile);
  const range = findTopLevelHooksArray(text);
  return Boolean(range && isRunlightHookCommand(range.text, agent));
}

async function installJsonHookPlugin(agent, definition, { env = process.env, command } = {}) {
  const configFile = definition.configFile(env);
  const config = await readJsonFile(configFile, {});
  const hooks = definition.configKey ? (config[definition.configKey] ||= {}) : (config.hooks ||= {});
  for (const [event, timeout, asyncHook] of definition.events) {
    hooks[event] = pruneHookEntries(hooks[event], agent);
    hooks[event].push(hookEntryFor(definition.format, agent, event, timeout, asyncHook, command));
  }
  await writeJsonFile(configFile, config);
  return { configFile, events: definition.events.map(([event]) => event), command: commandFor(agent, command) };
}

async function uninstallJsonHookPlugin(agent, definition, { env = process.env } = {}) {
  const configFile = definition.configFile(env);
  const config = await readJsonFile(configFile, {});
  const hooks = definition.configKey ? (config[definition.configKey] ||= {}) : (config.hooks ||= {});
  for (const event of Object.keys(hooks)) {
    hooks[event] = pruneHookEntries(hooks[event], agent);
    if (hooks[event].length === 0) delete hooks[event];
  }
  await writeJsonFile(configFile, config);
  return { configFile };
}

export async function installCodexPlugin({ env = process.env, command } = {}) {
  const home = codexHome(env);
  const hooksFile = path.join(home, "hooks.json");
  const config = await readJsonFile(hooksFile, { hooks: {} });
  config.hooks ||= {};
  for (const [event, timeout, asyncHook] of CODEX_EVENTS) {
    config.hooks[event] = pruneHookEntries(config.hooks[event], "codex");
    config.hooks[event].push({
      hooks: [{ type: "command", command: commandFor("codex", command), timeout, async: Boolean(asyncHook) }],
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
  const result = await installJsonHookPlugin("claude", AGENT_PLUGIN_DEFINITIONS.claude, { env, command });
  return { settingsFile: result.configFile, events: result.events, command: result.command };
}

export async function uninstallClaudePlugin({ env = process.env } = {}) {
  const result = await uninstallJsonHookPlugin("claude", AGENT_PLUGIN_DEFINITIONS.claude, { env });
  return { settingsFile: result.configFile };
}

export async function installAgentPlugin(agent, opts = {}) {
  const source = normalizeAgentSource(agent);
  if (source === "codex") return installCodexPlugin(opts);
  if (source === "claude") return installClaudePlugin(opts);
  const definition = AGENT_PLUGIN_DEFINITIONS[source];
  if (!definition) {
    return {
      agent: source,
      installed: false,
      reason: "This agent needs a provider-specific extension hook; Runlight can ingest its events when configured to call `runlight hook`.",
    };
  }
  if (definition.format === "kimi-toml") return { agent: source, installed: true, ...(await installKimiTomlHookPlugin(source, definition, opts)) };
  return { agent: source, installed: true, ...(await installJsonHookPlugin(source, definition, opts)) };
}

function pluginFailureResult(agent, action, error) {
  return {
    agent,
    [action === "uninstall" ? "uninstalled" : "installed"]: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
      ...(error && typeof error === "object" && "code" in error ? { code: error.code } : {}),
      ...(error && typeof error === "object" && "path" in error ? { path: error.path } : {}),
      ...(error && typeof error === "object" && "syscall" in error ? { syscall: error.syscall } : {}),
    },
  };
}

function commandForAllAgent(agent, command) {
  return command?.replace(/\b(codex|claude)\b/g, agent);
}

export async function installAllAgentPlugins({ env = process.env, command } = {}) {
  const results = {};
  for (const agent of SUPPORTED_PLUGIN_TARGETS) {
    try {
      results[agent] = await installAgentPlugin(agent, { env, command: commandForAllAgent(agent, command) });
    } catch (error) {
      results[agent] = pluginFailureResult(agent, "install", error);
    }
  }
  return results;
}

export async function uninstallAgentPlugin(agent, opts = {}) {
  const source = normalizeAgentSource(agent);
  if (source === "codex") return uninstallCodexPlugin(opts);
  if (source === "claude") return uninstallClaudePlugin(opts);
  const definition = AGENT_PLUGIN_DEFINITIONS[source];
  if (!definition) return { agent: source, uninstalled: false };
  if (definition.format === "kimi-toml") return { agent: source, ...(await uninstallKimiTomlHookPlugin(source, definition, opts)) };
  return { agent: source, ...(await uninstallJsonHookPlugin(source, definition, opts)) };
}

export async function uninstallAllAgentPlugins({ env = process.env } = {}) {
  const results = {};
  for (const agent of SUPPORTED_PLUGIN_TARGETS) {
    try {
      results[agent] = await uninstallAgentPlugin(agent, { env });
    } catch (error) {
      results[agent] = pluginFailureResult(agent, "uninstall", error);
    }
  }
  return results;
}

export async function pluginStatus({ env = process.env } = {}) {
  const hooksFile = path.join(codexHome(env), "hooks.json");
  const codex = await readJsonFile(hooksFile, { hooks: {} });
  const codexInstalled = Object.values(codex.hooks || {}).some((entries) =>
    (entries || []).some((entry) => (entry.hooks || []).some((hook) => isRunlightHookCommand(hook.command, "codex"))),
  );
  const status = {
    codex: { installed: codexInstalled, hooksFile },
  };

  for (const agent of SUPPORTED_PLUGIN_TARGETS) {
    if (agent === "codex") continue;
    const definition = AGENT_PLUGIN_DEFINITIONS[agent];
    if (!definition) {
      status[agent] = { installed: false, manual: true };
      continue;
    }
    const configFile = definition.configFile(env);
    if (definition.format === "kimi-toml") {
      status[agent] = { installed: await isKimiTomlHookInstalled(agent, definition, { env }), configFile };
      continue;
    }
    const config = await readJsonFile(configFile, {});
    const hooks = definition.configKey ? config[definition.configKey] : config.hooks;
    const installed = Object.values(hooks || {}).some((entries) =>
      (entries || []).some((entry) => {
        if (Array.isArray(entry.hooks)) {
          return entry.hooks.some((hook) => isRunlightHookCommand(hook.command, agent));
        }
        return isRunlightHookCommand(entry.command, agent);
      }),
    );
    status[agent] = { installed, configFile };
    if (agent === "claude") status[agent].settingsFile = configFile;
  }

  return status;
}
