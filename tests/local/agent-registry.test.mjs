import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalResponseForDecision,
  isBlockingApprovalEvent,
  normalizeAgentSource,
  normalizeHookEventName,
  SUPPORTED_AGENT_SOURCES,
} from "../../src/local/agent-registry.js";

describe("agent registry", () => {
  it("recognizes the same built-in agent source keys as the local island-style hook surface", () => {
    assert.deepEqual(SUPPORTED_AGENT_SOURCES, [
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
    ]);
  });

  it("normalizes provider-specific event names into Runlight hook lifecycle names", () => {
    assert.equal(normalizeHookEventName("beforeShellExecution"), "PreToolUse");
    assert.equal(normalizeHookEventName("BeforeTool"), "PreToolUse");
    assert.equal(normalizeHookEventName("permission_request"), "PermissionRequest");
    assert.equal(normalizeHookEventName("userPromptSubmitted"), "UserPromptSubmit");
    assert.equal(normalizeHookEventName("TaskComplete"), "TaskRoundComplete");
  });

  it("detects permission requests from all supported event-name dialects", () => {
    assert.equal(isBlockingApprovalEvent({ hook_event_name: "PermissionRequest" }), true);
    assert.equal(isBlockingApprovalEvent({ hook_event_name: "permission_request" }), true);
    assert.equal(isBlockingApprovalEvent({ event: "permission_request" }), true);
    assert.equal(isBlockingApprovalEvent({ hook_event_name: "PreToolUse" }), false);
  });

  it("normalizes aliases without dropping the original source vocabulary", () => {
    assert.equal(normalizeAgentSource("Claude Code"), "claude");
    assert.equal(normalizeAgentSource("cursor-cli"), "cursor-cli");
    assert.equal(normalizeAgentSource("google-antigravity"), "google-antigravity");
  });

  it("formats approval decisions as hook responses that agents can consume", () => {
    assert.deepEqual(JSON.parse(approvalResponseForDecision("allow")), {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
    assert.deepEqual(JSON.parse(approvalResponseForDecision("deny")), {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny" },
      },
    });
  });
});
