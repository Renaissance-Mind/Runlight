import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createDaemonServer, queryDaemon } from "../../src/local/daemon.js";
import { saveConfig } from "../../src/local/config.js";
import { defaultConfig } from "../../src/local/config.js";

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
