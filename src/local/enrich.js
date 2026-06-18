import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function firstLine(value, max = 240) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, max) || "";
}

function safeGit(cwd, args) {
  if (!cwd) return "";
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    }).trim();
  } catch {
    return "";
  }
}

async function readJson(pathname) {
  const text = await fs.readFile(pathname, "utf8");
  return JSON.parse(text);
}

async function resolveCodexSessionName(sessionId, env = process.env) {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const sessionIndex = env.RUNLIGHT_CODEX_SESSION_INDEX || path.join(codexHome, "session_index.jsonl");
  try {
    const text = await fs.readFile(sessionIndex, "utf8");
    const lines = text.trim().split("\n").reverse();
    for (const line of lines) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      if (item.id === sessionId) return firstLine(item.thread_name);
    }
  } catch {
    return "";
  }
  return "";
}

async function codexSessionIndexHasId(sessionId, env = process.env) {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const sessionIndex = env.RUNLIGHT_CODEX_SESSION_INDEX || path.join(codexHome, "session_index.jsonl");
  try {
    const text = await fs.readFile(sessionIndex, "utf8");
    for (const line of text.trim().split("\n")) {
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      if (item.id === sessionId) return true;
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return false;
}

function localDateParts(date) {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
}

function utcDateParts(date) {
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ];
}

function candidateCodexSessionDirs(codexHome, now = new Date()) {
  const dirs = new Set();
  for (const offsetDays of [-1, 0, 1]) {
    const date = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    dirs.add(path.join(codexHome, "sessions", ...localDateParts(date)));
    dirs.add(path.join(codexHome, "sessions", ...utcDateParts(date)));
  }
  dirs.add(path.join(codexHome, "archived_sessions"));
  return Array.from(dirs);
}

async function dirHasCodexSessionFile(dir, sessionId) {
  try {
    const names = await fs.readdir(dir);
    return names.some((name) => name.includes(sessionId) && name.endsWith(".jsonl"));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return false;
}

export async function isKnownCodexSession(sessionId, env = process.env, now = new Date()) {
  if (!sessionId) return false;
  if (await codexSessionIndexHasId(sessionId, env)) return true;

  const codexHome = env.CODEX_HOME || path.join(os.homedir(), ".codex");
  for (const dir of candidateCodexSessionDirs(codexHome, now)) {
    if (await dirHasCodexSessionFile(dir, sessionId)) return true;
  }
  return false;
}

export async function shouldIgnoreUnpersistedCodexStartup(input, env = process.env, now = new Date()) {
  if (booleanLike(env.RUNLIGHT_ALLOW_UNPERSISTED_CODEX_SESSIONS)) return false;
  if ((input.hook_event_name || "") !== "SessionStart") return false;
  if ((input.source || input.automation_source || "") !== "startup") return false;
  if (!input.session_id) return false;

  if (await isKnownCodexSession(input.session_id, env, now)) return false;
  await new Promise((resolve) => setTimeout(resolve, 150));
  return !(await isKnownCodexSession(input.session_id, env, new Date()));
}

async function resolveCodexSessionPin(sessionId, env = process.env) {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const globalState = env.RUNLIGHT_CODEX_GLOBAL_STATE || path.join(codexHome, ".codex-global-state.json");
  try {
    const state = await readJson(globalState);
    return Array.isArray(state["pinned-thread-ids"]) && state["pinned-thread-ids"].includes(sessionId);
  } catch {
    return false;
  }
}

function buildWorkspace(cwd) {
  const repoRoot = safeGit(cwd, ["rev-parse", "--show-toplevel"]);
  const projectName = path.basename(repoRoot || cwd || "");
  return {
    cwd: cwd || "",
    repo_root: repoRoot,
    git_branch: safeGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git_commit: safeGit(cwd, ["rev-parse", "--short", "HEAD"]),
    project_name: projectName,
  };
}

function buildMachine(config) {
  return {
    hostname: os.hostname().split(".")[0] || "unknown",
    os: os.platform(),
    arch: os.arch(),
    user: os.userInfo().username || "unknown",
    machine_id: config.machine_id,
  };
}

function toolPayload(toolName, extra = {}) {
  return { tool_name: toolName || "", ...extra };
}

function booleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function automationSource(input, env) {
  if (typeof input.automation === "object" && input.automation !== null) {
    const source = input.automation.source
      || input.automation.reason
      || input.automation.trigger
      || input.automation.kind
      || input.automation.origin;
    if (source) return String(source);
  }

  for (const key of ["automation_source", "automationSource", "trigger", "source", "origin", "invocation_source"]) {
    if (typeof input[key] === "string" && input[key].trim()) return input[key].trim();
  }

  if (env.RUNLIGHT_AUTOMATION_SOURCE) return env.RUNLIGHT_AUTOMATION_SOURCE.trim();
  if (env.GITHUB_ACTIONS) return "github-actions";
  if (env.CI) return "ci";
  return "";
}

export function detectAutomation(input = {}, env = process.env) {
  const nested = typeof input.automation === "object" && input.automation !== null ? input.automation : {};
  const explicit = booleanLike(input.automation)
    || booleanLike(input.automated)
    || booleanLike(input.is_automation)
    || booleanLike(input.isAutomation)
    || booleanLike(nested.automated)
    || booleanLike(nested.is_automation)
    || booleanLike(nested.isAutomation)
    || booleanLike(env.RUNLIGHT_AUTOMATION);
  const source = automationSource(input, env);
  const sourceLooksAutomated = /automation|automated|scheduled|schedule|cron|background|headless|ci|script|batch/i.test(source);
  const automated = explicit || sourceLooksAutomated || Boolean(env.GITHUB_ACTIONS);
  return {
    automated,
    source: source || null,
  };
}

function attachAutomation(payload, automation) {
  if (!automation.automated && !automation.source) return payload;
  return {
    ...(payload || {}),
    automation,
  };
}

async function buildCodexEvent(input, config, env) {
  const hookEvent = input.hook_event_name || "";
  const sessionId = input.session_id || "";
  if (!sessionId) return null;

  const toolName = input.tool_name || "";
  const model = input.model || "";
  const command = firstLine(input.tool_input?.command, 100);
  const filePath = input.tool_input?.file_path || "";
  const automation = detectAutomation(input, env);

  const common = {
    session_id: sessionId,
    session_name: await resolveCodexSessionName(sessionId, env),
    session_pin: await resolveCodexSessionPin(sessionId, env),
    agent_type: "codex",
    adapter_name: "codex-hook",
    adapter_version: "0.3.0",
    event_time: new Date().toISOString(),
    severity: "info",
    machine: buildMachine(config),
    workspace: buildWorkspace(input.cwd || process.cwd()),
  };

  switch (hookEvent) {
    case "SessionStart":
      return { ...common, event_type: "session.started", summary: `Codex session started (model: ${model})`, payload: attachAutomation({ model }, automation) };
    case "PreToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.started", summary: `Bash: ${command}`, payload: attachAutomation(toolPayload(toolName, { command_label: command }), automation) };
      }
      return { ...common, event_type: "tool.started", summary: `Tool: ${toolName}`, payload: attachAutomation(toolPayload(toolName, { file_path: filePath }), automation) };
    case "PostToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.finished", summary: `Bash done: ${toolName}`, payload: attachAutomation(toolPayload(toolName), automation) };
      }
      return { ...common, event_type: "tool.finished", summary: `Tool done: ${toolName}`, payload: attachAutomation(toolPayload(toolName), automation) };
    case "PostToolUseFailure":
      return { ...common, event_type: "tool.finished", severity: "warning", summary: `Tool failed: ${toolName}`, payload: attachAutomation(toolPayload(toolName, { failed: true }), automation) };
    case "UserPromptSubmit":
      return { ...common, event_type: "message.started", summary: "User prompt submitted", payload: attachAutomation(null, automation) };
    case "Stop":
      return { ...common, event_type: "message.finished", summary: "Codex response finished", payload: attachAutomation(null, automation) };
    default:
      return null;
  }
}

async function buildClaudeEvent(input, config, env) {
  const hookEvent = input.hook_event_name || "";
  const sessionId = input.session_id || "";
  if (!sessionId) return null;

  const toolName = input.tool_name || "";
  const model = input.model || "";
  const command = firstLine(input.tool_input?.command, 100);
  const filePath = input.tool_input?.file_path || "";
  const automation = detectAutomation(input, env);

  const common = {
    session_id: sessionId,
    agent_type: "claude_code",
    adapter_name: "claude-code-hook",
    adapter_version: "0.3.0",
    event_time: new Date().toISOString(),
    severity: "info",
    machine: buildMachine(config),
    workspace: buildWorkspace(input.cwd || process.cwd()),
  };

  switch (hookEvent) {
    case "SessionStart":
      return { ...common, event_type: "session.started", summary: `Claude Code session started (model: ${model})`, payload: attachAutomation({ model, source: input.source || "" }, automation) };
    case "PreToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.started", summary: `Bash: ${command}`, payload: attachAutomation(toolPayload(toolName, { command_label: command }), automation) };
      }
      return { ...common, event_type: "tool.started", summary: `Tool: ${toolName}`, payload: attachAutomation(toolPayload(toolName, { file_path: filePath }), automation) };
    case "PostToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.finished", summary: `Bash done: ${toolName}`, payload: attachAutomation(toolPayload(toolName), automation) };
      }
      return { ...common, event_type: "tool.finished", summary: `Tool done: ${toolName}`, payload: attachAutomation(toolPayload(toolName), automation) };
    case "PostToolUseFailure":
      return { ...common, event_type: "tool.finished", severity: "warning", summary: `Tool failed: ${toolName}`, payload: attachAutomation(toolPayload(toolName, { failed: true }), automation) };
    case "PermissionRequest":
      return { ...common, event_type: "permission.requested", summary: `Permission: ${toolName}`, payload: attachAutomation(toolPayload(toolName), automation) };
    case "UserPromptSubmit":
      return { ...common, event_type: "message.started", summary: "User prompt submitted", payload: attachAutomation(null, automation) };
    case "SubagentStart":
      return { ...common, event_type: "tool.started", summary: "Subagent started", payload: attachAutomation(toolPayload("subagent"), automation) };
    case "SubagentStop":
      return { ...common, event_type: "tool.finished", summary: "Subagent finished", payload: attachAutomation(toolPayload("subagent"), automation) };
    case "SessionEnd":
      return { ...common, event_type: "session.completed", summary: "Claude Code session ended", payload: attachAutomation({ reason: input.reason || "" }, automation) };
    case "Stop":
      return { ...common, event_type: "message.finished", summary: "Claude Code response finished", payload: attachAutomation(null, automation) };
    default:
      return null;
  }
}

export async function buildHookEvent(agent, input, config, env = process.env) {
  if (agent === "codex") return buildCodexEvent(input, config, env);
  if (agent === "claude") return buildClaudeEvent(input, config, env);
  throw new Error(`Unsupported hook agent: ${agent}`);
}

export async function enrichRawHookEvents(rawEvents, config, env = process.env) {
  const events = [];
  for (const raw of rawEvents) {
    const event = await buildHookEvent(raw.agent, raw.input || {}, config, env);
    if (event) events.push(event);
  }
  return events;
}
