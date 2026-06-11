import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "./config.js";
import { localDaemonUrl } from "./paths.js";

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

async function buildCodexEvent(input, config) {
  const hookEvent = input.hook_event_name || "";
  const sessionId = input.session_id || "";
  if (!sessionId) return null;

  const toolName = input.tool_name || "";
  const model = input.model || "";
  const command = firstLine(input.tool_input?.command, 100);
  const filePath = input.tool_input?.file_path || "";

  const common = {
    session_id: sessionId,
    session_name: await resolveCodexSessionName(sessionId),
    session_pin: await resolveCodexSessionPin(sessionId),
    agent_type: "codex",
    adapter_name: "codex-hook",
    adapter_version: "0.2.0",
    event_time: new Date().toISOString(),
    severity: "info",
    machine: buildMachine(config),
    workspace: buildWorkspace(input.cwd || process.cwd()),
  };

  switch (hookEvent) {
    case "SessionStart":
      return { ...common, event_type: "session.started", summary: `Codex session started (model: ${model})`, payload: { model } };
    case "PreToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.started", summary: `Bash: ${command}`, payload: toolPayload(toolName, { command_label: command }) };
      }
      return { ...common, event_type: "tool.started", summary: `Tool: ${toolName}`, payload: toolPayload(toolName, { file_path: filePath }) };
    case "PostToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.finished", summary: `Bash done: ${toolName}`, payload: toolPayload(toolName) };
      }
      return { ...common, event_type: "tool.finished", summary: `Tool done: ${toolName}`, payload: toolPayload(toolName) };
    case "PostToolUseFailure":
      return { ...common, event_type: "tool.finished", severity: "warning", summary: `Tool failed: ${toolName}`, payload: toolPayload(toolName, { failed: true }) };
    case "UserPromptSubmit":
      return { ...common, event_type: "message.started", summary: "User prompt submitted", payload: null };
    case "Stop":
      return { ...common, event_type: "message.finished", summary: "Codex response finished", payload: null };
    default:
      return null;
  }
}

async function buildClaudeEvent(input, config) {
  const hookEvent = input.hook_event_name || "";
  const sessionId = input.session_id || "";
  if (!sessionId) return null;

  const toolName = input.tool_name || "";
  const model = input.model || "";
  const command = firstLine(input.tool_input?.command, 100);
  const filePath = input.tool_input?.file_path || "";

  const common = {
    session_id: sessionId,
    agent_type: "claude_code",
    adapter_name: "claude-code-hook",
    adapter_version: "0.2.0",
    event_time: new Date().toISOString(),
    severity: "info",
    machine: buildMachine(config),
    workspace: buildWorkspace(input.cwd || process.cwd()),
  };

  switch (hookEvent) {
    case "SessionStart":
      return { ...common, event_type: "session.started", summary: `Claude Code session started (model: ${model})`, payload: { model, source: input.source || "" } };
    case "PreToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.started", summary: `Bash: ${command}`, payload: toolPayload(toolName, { command_label: command }) };
      }
      return { ...common, event_type: "tool.started", summary: `Tool: ${toolName}`, payload: toolPayload(toolName, { file_path: filePath }) };
    case "PostToolUse":
      if (toolName === "Bash" || toolName === "bash") {
        return { ...common, event_type: "command.finished", summary: `Bash done: ${toolName}`, payload: toolPayload(toolName) };
      }
      return { ...common, event_type: "tool.finished", summary: `Tool done: ${toolName}`, payload: toolPayload(toolName) };
    case "PostToolUseFailure":
      return { ...common, event_type: "tool.finished", severity: "warning", summary: `Tool failed: ${toolName}`, payload: toolPayload(toolName, { failed: true }) };
    case "PermissionRequest":
      return { ...common, event_type: "permission.requested", summary: `Permission: ${toolName}`, payload: toolPayload(toolName) };
    case "UserPromptSubmit":
      return { ...common, event_type: "message.started", summary: "User prompt submitted", payload: null };
    case "SubagentStart":
      return { ...common, event_type: "tool.started", summary: "Subagent started", payload: toolPayload("subagent") };
    case "SubagentStop":
      return { ...common, event_type: "tool.finished", summary: "Subagent finished", payload: toolPayload("subagent") };
    case "SessionEnd":
      return { ...common, event_type: "session.completed", summary: "Claude Code session ended", payload: { reason: input.reason || "" } };
    case "Stop":
      return { ...common, event_type: "message.finished", summary: "Claude Code response finished", payload: null };
    default:
      return null;
  }
}

export async function buildHookEvent(agent, input, config) {
  if (agent === "codex") return buildCodexEvent(input, config);
  if (agent === "claude") return buildClaudeEvent(input, config);
  throw new Error(`Unsupported hook agent: ${agent}`);
}

export async function postHookInput(agent, rawInput, { env = process.env, fetchImpl = fetch } = {}) {
  const config = await loadConfig(env);
  const input = JSON.parse(rawInput || "{}");
  const event = await buildHookEvent(agent, input, config);
  if (!event) return { sent: false, reason: "ignored" };

  const response = await fetchImpl(`${localDaemonUrl(config)}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runlight-local-secret": config.local_secret,
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) return { sent: false, reason: `daemon HTTP ${response.status}` };
  return { sent: true, daemon: await response.json() };
}

export async function readStdin(stdin = process.stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
