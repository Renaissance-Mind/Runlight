export const SUPPORTED_AGENT_SOURCES = [
  "claude",
  "codex",
  "gemini",
  "cursor",
  "cursor-cli",
  "trae",
  "traecn",
  "traecli",
  "copilot",
  "qoder",
  "qoder-cli",
  "droid",
  "codebuddy",
  "codybuddycn",
  "stepfun",
  "opencode",
  "antigravity",
  "google-antigravity",
  "workbuddy",
  "hermes",
  "qwen",
  "kimi",
  "pi",
  "kiro",
  "cline",
];

const SUPPORTED_AGENT_SET = new Set(SUPPORTED_AGENT_SOURCES);

const AGENT_ALIASES = new Map([
  ["claude code", "claude"],
  ["claude-code", "claude"],
  ["claude_code", "claude"],
  ["codex cli", "codex"],
  ["cursor cli", "cursor-cli"],
  ["cursor_cli", "cursor-cli"],
  ["qoder cli", "qoder-cli"],
  ["qoder_cli", "qoder-cli"],
  ["trae cn", "traecn"],
  ["trae-cn", "traecn"],
  ["factory", "droid"],
  ["codybuddy-cn", "codybuddycn"],
  ["codybuddy cn", "codybuddycn"],
  ["google antigravity", "google-antigravity"],
  ["qwen code", "qwen"],
  ["kimi code", "kimi"],
  ["kimi code cli", "kimi"],
]);

const EVENT_ALIASES = new Map([
  ["beforeSubmitPrompt", "UserPromptSubmit"],
  ["beforeShellExecution", "PreToolUse"],
  ["afterShellExecution", "PostToolUse"],
  ["beforeReadFile", "PreToolUse"],
  ["afterFileEdit", "PostToolUse"],
  ["beforeMCPExecution", "PreToolUse"],
  ["afterMCPExecution", "PostToolUse"],
  ["afterAgentThought", "Notification"],
  ["afterAgentResponse", "AfterAgentResponse"],
  ["stop", "Stop"],
  ["BeforeTool", "PreToolUse"],
  ["AfterTool", "PostToolUse"],
  ["BeforeAgent", "SubagentStart"],
  ["AfterAgent", "SubagentStop"],
  ["sessionStart", "SessionStart"],
  ["sessionEnd", "SessionEnd"],
  ["userPromptSubmitted", "UserPromptSubmit"],
  ["preToolUse", "PreToolUse"],
  ["postToolUse", "PostToolUse"],
  ["errorOccurred", "Notification"],
  ["agentSpawn", "SessionStart"],
  ["userPromptSubmit", "UserPromptSubmit"],
  ["session_start", "SessionStart"],
  ["session_end", "SessionEnd"],
  ["user_prompt_submit", "UserPromptSubmit"],
  ["pre_tool_use", "PreToolUse"],
  ["post_tool_use", "PostToolUse"],
  ["post_tool_use_failure", "PostToolUseFailure"],
  ["permission_request", "PermissionRequest"],
  ["pre_approval_request", "PermissionRequest"],
  ["subagent_start", "SubagentStart"],
  ["subagent_stop", "SubagentStop"],
  ["pre_compact", "PreCompact"],
  ["post_compact", "PostCompact"],
  ["notification", "Notification"],
  ["pre_tool_call", "PreToolUse"],
  ["post_tool_call", "PostToolUse"],
  ["pre_llm_call", "UserPromptSubmit"],
  ["on_session_start", "SessionStart"],
  ["on_session_end", "SessionEnd"],
  ["on_session_reset", "SessionEnd"],
  ["TaskStart", "SessionStart"],
  ["TaskResume", "UserPromptSubmit"],
  ["TaskComplete", "TaskRoundComplete"],
  ["TaskCancel", "TaskRoundComplete"],
  ["tool_call", "PreToolUse"],
  ["tool_call_done", "PostToolUse"],
]);

export function normalizeAgentSource(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const alias = AGENT_ALIASES.get(lower);
  if (alias) return alias;
  if (SUPPORTED_AGENT_SET.has(lower)) return lower;
  return lower;
}

export function isSupportedAgentSource(value) {
  return SUPPORTED_AGENT_SET.has(normalizeAgentSource(value));
}

export function hookEventNameFromInput(input = {}) {
  return String(
    input.hook_event_name
      ?? input.hookEventName
      ?? input.event_name
      ?? input.eventName
      ?? input.event
      ?? input.type
      ?? "",
  );
}

export function normalizeHookEventName(name) {
  const raw = String(name || "");
  return EVENT_ALIASES.get(raw) || raw;
}

export function normalizedHookEventNameFromInput(input = {}) {
  return normalizeHookEventName(hookEventNameFromInput(input));
}

export function isBlockingApprovalEvent(input = {}) {
  return normalizedHookEventNameFromInput(input) === "PermissionRequest";
}

export function sessionIdFromInput(input = {}) {
  return String(input.session_id ?? input.sessionId ?? input.conversation_id ?? input.thread_id ?? "").trim();
}

export function toolNameFromInput(input = {}) {
  if (typeof input.tool_name === "string") return input.tool_name;
  if (typeof input.toolName === "string") return input.toolName;
  if (typeof input.tool === "string") return input.tool;
  if (input.tool && typeof input.tool.name === "string") return input.tool.name;
  return "";
}

export function toolInputFromInput(input = {}) {
  if (input.tool_input && typeof input.tool_input === "object") return input.tool_input;
  if (input.toolInput && typeof input.toolInput === "object") return input.toolInput;
  if (input.input && typeof input.input === "object") return input.input;
  if (input.params && typeof input.params === "object") return input.params;
  return {};
}

export function agentTypeForSource(source) {
  const normalized = normalizeAgentSource(source);
  if (normalized === "claude") return "claude_code";
  if (normalized === "cursor-cli") return "cursor";
  if (normalized === "qoder-cli") return "qoder";
  return normalized || "unknown";
}

export function adapterNameForSource(source) {
  const normalized = normalizeAgentSource(source);
  if (normalized === "claude") return "claude-code-hook";
  return `${normalized || "unknown"}-hook`;
}

export function approvalResponseForDecision(decision, { remember = false, toolName = "" } = {}) {
  const behavior = decision === "deny" ? "deny" : "allow";
  const payload = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior,
      },
    },
  };

  if (behavior === "allow" && remember && toolName) {
    const rule = { toolName };
    if (!toolName.startsWith("mcp__")) rule.ruleContent = "*";
    payload.hookSpecificOutput.decision.updatedPermissions = [{
      type: "addRules",
      rules: [rule],
      behavior: "allow",
      destination: "session",
    }];
  }

  return JSON.stringify(payload);
}
