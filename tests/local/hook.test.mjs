import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { defaultConfig, saveConfig } from "../../src/local/config.js";
import { buildHookEvent } from "../../src/local/enrich.js";
import { buildRawHookEnvelope, postHookInput } from "../../src/local/hook.js";

const config = {
  machine_id: "machine-test",
};

const servers = [];

after(async () => {
  for (const close of servers.reverse()) await close();
});

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "runlight-hook-home-"));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("local hook forwarding", () => {
  it("wraps raw hook input without applying Runlight protocol enrichment", () => {
    const envelope = buildRawHookEnvelope("codex", {
      hook_event_name: "PreToolUse",
      session_id: "sess-raw",
    });

    assert.equal(envelope.agent, "codex");
    assert.equal(envelope.input.session_id, "sess-raw");
    assert.ok(envelope.received_at);
    assert.equal(envelope.event_type, undefined);
    assert.equal(envelope.session_pin, undefined);
  });

  it("posts raw hook input to the local daemon raw-events endpoint", async () => {
    const received = [];
    const localDaemon = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.push({
          url: req.url,
          secret: req.headers["x-runlight-local-secret"],
          body: JSON.parse(raw),
        });
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "queued", count: 1 }));
      });
    });
    const address = await listen(localDaemon);
    servers.push(() => closeServer(localDaemon));

    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const saved = defaultConfig(env);
    saved.local_secret = "local-secret";
    saved.daemon.port = address.port;
    await saveConfig(saved, env);

    const result = await postHookInput("codex", JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "sess-forward",
      tool_name: "Bash",
    }), { env });

    assert.equal(result.sent, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].url, "/events/raw");
    assert.equal(received[0].secret, "local-secret");
    assert.equal(received[0].body.agent, "codex");
    assert.equal(received[0].body.input.session_id, "sess-forward");
  });

  it("returns blocking approval hook output from the local daemon", async () => {
    const localDaemon = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          status: "resolved",
          hook_response: "{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\"}}}",
        }));
      });
    });
    const address = await listen(localDaemon);
    servers.push(() => closeServer(localDaemon));

    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const saved = defaultConfig(env);
    saved.local_secret = "local-secret";
    saved.daemon.port = address.port;
    await saveConfig(saved, env);

    const result = await postHookInput("claude", JSON.stringify({
      hook_event_name: "PermissionRequest",
      session_id: "sess-approval",
      tool_name: "Bash",
    }), { env });

    assert.equal(result.sent, true);
    assert.match(result.hookResponse, /"behavior":"allow"/);
  });
});

describe("local daemon hook event enrichment", () => {
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
    assert.equal(event.adapter_version, "0.3.0");
    assert.equal(event.event_type, "command.started");
    assert.equal(event.summary, "Bash: npm test");
    assert.equal(event.payload.command_label, "npm test");
    assert.equal(event.machine.machine_id, "machine-test");
  });

  it("attaches automation hints during daemon-side enrichment", async () => {
    const event = await buildHookEvent("codex", {
      hook_event_name: "PreToolUse",
      session_id: "sess-automation",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      automation_source: "scheduled-run",
      cwd: process.cwd(),
    }, config);

    assert.equal(event.payload.automation.automated, true);
    assert.equal(event.payload.automation.source, "scheduled-run");
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
    assert.equal(event.adapter_version, "0.3.0");
    assert.equal(event.event_type, "session.completed");
    assert.deepEqual(event.payload, { reason: "completed" });
  });
});
