import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createDaemonServer, drainPending, enqueueEvents, queryDaemon } from "../../src/local/daemon.js";
import { saveConfig } from "../../src/local/config.js";
import { defaultConfig } from "../../src/local/config.js";
import { resolvePaths } from "../../src/local/paths.js";

const servers = [];

after(async () => {
  for (const close of servers.reverse()) await close();
});

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "runlight-daemon-home-"));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function freePort() {
  const server = http.createServer();
  const address = await listen(server);
  await closeServer(server);
  return address.port;
}

function testEvent() {
  return {
    session_id: "sess-daemon",
    agent_type: "codex",
    adapter_name: "codex-hook",
    adapter_version: "0.2.0",
    event_type: "session.started",
    event_time: new Date().toISOString(),
    severity: "info",
    summary: "started",
  };
}

function testEvents(count, prefix = "sess-daemon") {
  return Array.from({ length: count }, (_value, index) => ({
    ...testEvent(),
    session_id: `${prefix}-${index}`,
    event_time: new Date(Date.now() + index).toISOString(),
  }));
}

describe("local daemon", () => {
  it("queues events and flushes them to the configured server", async () => {
    const received = [];
    const remote = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.push({
          url: req.url,
          auth: req.headers.authorization,
          body: JSON.parse(raw),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events: [{ event_id: "evt-1", session_id: "sess-daemon", status: "running" }] }));
      });
    });
    const remoteAddress = await listen(remote);
    servers.push(() => closeServer(remote));

    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.server_url = `http://127.0.0.1:${remoteAddress.port}`;
    config.upload_token = "upload-token";
    config.daemon.port = 0;
    await saveConfig(config, env);

    const daemon = await createDaemonServer({ env });
    servers.push(() => daemon.close());

    const response = await fetch(`http://127.0.0.1:${daemon.server.address().port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runlight-local-secret": config.local_secret,
      },
      body: JSON.stringify(testEvent()),
    });
    assert.equal(response.status, 202);

    await daemon.flush();
    assert.equal(received.length, 1);
    assert.equal(received[0].url, "/api/events");
    assert.equal(received[0].auth, "Bearer upload-token");
    assert.equal(received[0].body.events[0].session_id, "sess-daemon");
  });

  it("drains multiple upload batches in one flush", async () => {
    const received = [];
    const remote = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.push(JSON.parse(raw).events.length);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events: [] }));
      });
    });
    const remoteAddress = await listen(remote);
    servers.push(() => closeServer(remote));

    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.server_url = `http://127.0.0.1:${remoteAddress.port}`;
    config.upload_token = "upload-token";
    await saveConfig(config, env);

    const paths = resolvePaths(env);
    await enqueueEvents(paths, testEvents(205, "sess-drain"));

    const state = await drainPending({ config, paths });
    assert.deepEqual(received, [200, 5]);
    assert.equal(state.pending_count, 0);
    assert.equal(state.last_flush_batch_count, 2);
    assert.equal(state.last_flush_event_count, 205);
  });

  it("serializes manual and scheduled flushes through the same lock", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.server_url = "http://runlight.test";
    config.upload_token = "upload-token";
    config.daemon.port = 0;
    await saveConfig(config, env);

    const daemon = await createDaemonServer({
      env,
      fetchImpl: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        inFlight -= 1;
        return new Response(JSON.stringify({ events: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    servers.push(() => daemon.close());

    const eventResponse = await fetch(`http://127.0.0.1:${daemon.server.address().port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runlight-local-secret": config.local_secret,
      },
      body: JSON.stringify(testEvent()),
    });
    assert.equal(eventResponse.status, 202);

    const flushResponse = await fetch(`http://127.0.0.1:${daemon.server.address().port}/flush`, {
      method: "POST",
      headers: { "x-runlight-local-secret": config.local_secret },
    });
    assert.equal(flushResponse.status, 200);
    const body = await flushResponse.json();
    assert.equal(body.state.pending_count, 0);
    assert.equal(maxInFlight, 1);
    assert.equal(calls, 1);
  });

  it("flushes local-only events without requiring an upload token", async () => {
    const received = [];
    const remote = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.push({
          url: req.url,
          auth: req.headers.authorization,
          body: JSON.parse(raw),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events: [{ event_id: "evt-local", session_id: "sess-local", status: "running" }] }));
      });
    });
    const remoteAddress = await listen(remote);
    servers.push(() => closeServer(remote));

    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.server_url = `http://127.0.0.1:${remoteAddress.port}`;
    config.upload_token = "";
    config.daemon.port = 0;
    await saveConfig(config, env);

    const daemon = await createDaemonServer({ env });
    servers.push(() => daemon.close());

    const response = await fetch(`http://127.0.0.1:${daemon.server.address().port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runlight-local-secret": config.local_secret,
      },
      body: JSON.stringify({ ...testEvent(), session_id: "sess-local" }),
    });
    assert.equal(response.status, 202);

    await daemon.flush();
    assert.equal(received.length, 1);
    assert.equal(received[0].url, "/api/events");
    assert.equal(received[0].auth, undefined);
    assert.equal(received[0].body.events[0].session_id, "sess-local");
  });

  it("keeps pending events and stays reachable when remote upload fails", async () => {
    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.server_url = "https://runlight.invalid";
    config.upload_token = "upload-token";
    config.daemon.port = 0;
    await saveConfig(config, env);

    const daemon = await createDaemonServer({
      env,
      fetchImpl: async () => {
        throw new Error("network unavailable");
      },
    });
    servers.push(() => daemon.close());

    const response = await fetch(`http://127.0.0.1:${daemon.server.address().port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runlight-local-secret": config.local_secret,
      },
      body: JSON.stringify(testEvent()),
    });
    assert.equal(response.status, 202);

    await daemon.flush();
    const statusResponse = await fetch(`http://127.0.0.1:${daemon.server.address().port}/status`, {
      headers: { "x-runlight-local-secret": config.local_secret },
    });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.status, "ok");
    assert.equal(status.pending_count, 1);
    assert.equal(status.queue.pending_count, 1);
    assert.ok(status.queue.queue_oldest_queued_at);
    assert.ok(Number.isFinite(status.queue.queue_oldest_age_seconds));
    assert.equal(status.state.upload_status, "error");
    assert.match(status.state.upload_error, /network unavailable/);
  });

  it("enriches raw hook events with Codex pin, title, and automation metadata before upload", async () => {
    const received = [];
    const remote = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        received.push({
          url: req.url,
          auth: req.headers.authorization,
          body: JSON.parse(raw),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ events: [{ event_id: "evt-raw", session_id: "sess-raw", status: "running" }] }));
      });
    });
    const remoteAddress = await listen(remote);
    servers.push(() => closeServer(remote));

    const home = await tempHome();
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "runlight-codex-home-"));
    await fs.writeFile(
      path.join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({ id: "sess-raw", thread_name: "Pinned deployment flow\nextra text" })}\n`,
    );
    await fs.writeFile(
      path.join(codexHome, ".codex-global-state.json"),
      `${JSON.stringify({ "pinned-thread-ids": ["sess-raw"] })}\n`,
    );

    const env = { ...process.env, RUNLIGHT_HOME: home, CODEX_HOME: codexHome };
    const config = defaultConfig(env);
    config.server_url = `http://127.0.0.1:${remoteAddress.port}`;
    config.upload_token = "upload-token";
    config.daemon.port = 0;
    await saveConfig(config, env);

    const daemon = await createDaemonServer({ env });
    servers.push(() => daemon.close());

    const response = await fetch(`http://127.0.0.1:${daemon.server.address().port}/events/raw`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runlight-local-secret": config.local_secret,
      },
      body: JSON.stringify({
        agent: "codex",
        input: {
          hook_event_name: "PreToolUse",
          session_id: "sess-raw",
          tool_name: "Bash",
          tool_input: { command: "npm test\nsecond line" },
          automation: { automated: true, source: "scheduled-run" },
          cwd: process.cwd(),
        },
      }),
    });
    assert.equal(response.status, 202);

    await daemon.flush();
    assert.equal(received.length, 1);
    const event = received[0].body.events[0];
    assert.equal(received[0].url, "/api/events");
    assert.equal(received[0].auth, "Bearer upload-token");
    assert.equal(event.session_id, "sess-raw");
    assert.equal(event.session_name, "Pinned deployment flow");
    assert.equal(event.session_pin, true);
    assert.equal(event.event_type, "command.started");
    assert.equal(event.adapter_version, "0.3.0");
    assert.equal(event.payload.command_label, "npm test");
    assert.equal(event.payload.automation.automated, true);
    assert.equal(event.payload.automation.source, "scheduled-run");
  });

  it("reports daemon status through the local authenticated endpoint", async () => {
    const home = await tempHome();
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const config = defaultConfig(env);
    config.daemon.port = await freePort();
    await saveConfig(config, env);

    const daemon = await createDaemonServer({ env });
    servers.push(() => daemon.close());

    const status = await queryDaemon("/status", { env });
    assert.equal(status.status, "ok");
    assert.equal(status.service, "runlight-daemon");
  });
});
