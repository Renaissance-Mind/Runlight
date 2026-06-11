import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHookEvent } from "../../src/local/hook.js";

const config = {
  machine_id: "machine-test",
};

describe("local hook event mapping", () => {
  it("maps Codex Bash pre-tool events to Runlight command events", async () => {
    const event = await buildHookEvent("codex", {
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Bash",
      tool_input: { command: "npm test\nsecond line" },
      cwd: process.cwd(),
    }, config);

    assert.equal(event.agent_type, "codex");
    assert.equal(event.adapter_name, "codex-hook");
    assert.equal(event.event_type, "command.started");
    assert.equal(event.summary, "Bash: npm test");
    assert.equal(event.payload.command_label, "npm test");
    assert.equal(event.machine.machine_id, "machine-test");
  });

  it("maps Claude session end to a terminal session event", async () => {
    const event = await buildHookEvent("claude", {
      hook_event_name: "SessionEnd",
      session_id: "sess-2",
      reason: "completed",
      cwd: process.cwd(),
    }, config);

    assert.equal(event.agent_type, "claude_code");
    assert.equal(event.adapter_name, "claude-code-hook");
    assert.equal(event.event_type, "session.completed");
    assert.deepEqual(event.payload, { reason: "completed" });
  });
});
