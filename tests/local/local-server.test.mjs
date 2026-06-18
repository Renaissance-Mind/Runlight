import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createLocalServer } from "../../src/local/local-server.js";

const servers = [];

after(async () => {
  for (const close of servers.reverse()) await close();
});

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "runlight-local-server-home-"));
}

function event(sessionId, eventType = "message.finished") {
  return {
    session_id: sessionId,
    session_name: "Local test session",
    session_pin: false,
    agent_type: "codex",
    adapter_name: "codex-hook",
    adapter_version: "0.3.0",
    event_type: eventType,
    event_time: new Date().toISOString(),
    severity: "info",
    summary: "Local event",
    machine: {
      hostname: "local-mac",
      os: "darwin",
      arch: "arm64",
      user: "chunqiu",
      machine_id: "local-machine-1",
    },
    workspace: {
      cwd: "/tmp/runlight",
      project_name: "runlight",
      git_branch: "main",
    },
    payload: { ok: true },
  };
}

describe("embedded local server", () => {
  it("accepts events without a token and exposes dashboard session APIs", async () => {
    const env = { ...process.env, RUNLIGHT_HOME: await tempHome() };
    const local = await createLocalServer({ env, host: "127.0.0.1", port: 0 });
    servers.push(() => local.close());
    const baseUrl = `http://127.0.0.1:${local.server.address().port}`;

    const ingest = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [event("sess-local")] }),
    });
    assert.equal(ingest.status, 200);
    const ingestBody = await ingest.json();
    assert.equal(ingestBody.events[0].session_id, "sess-local");

    const sessions = await (await fetch(`${baseUrl}/api/sessions/live`)).json();
    assert.equal(sessions.sessions.length, 1);
    assert.equal(sessions.sessions[0].session_id, "sess-local");
    assert.equal(sessions.sessions[0].user_id, "default");
    assert.equal(sessions.sessions[0].machine_id, "local-machine-1");
    assert.equal(sessions.sessions[0].machine_user, "chunqiu");
    assert.equal(sessions.sessions[0].machine_arch, "arm64");
    assert.equal(sessions.sessions[0].workspace_project_name, "runlight");
    assert.equal(sessions.sessions[0].current_status, "finished");

    const recent = await (await fetch(`${baseUrl}/api/events/recent?limit=5`)).json();
    assert.equal(recent.events.length, 1);
    assert.equal(recent.events[0].session_id, "sess-local");
    assert.deepEqual(recent.events[0].payload, { ok: true });

    const devices = await (await fetch(`${baseUrl}/api/devices`)).json();
    assert.equal(devices.devices.length, 1);
    assert.equal(devices.devices[0].device_key, "id:local-machine-1");
    assert.equal(devices.devices[0].device_name, "local-mac");
    assert.equal(devices.devices[0].last_connected_at, sessions.sessions[0].last_event_at);
    assert.equal(devices.devices[0].open_session_count, 1);
    assert.equal(devices.devices[0].session_count, 1);
  });

  it("stores user settings per bearer token user", async () => {
    const env = { ...process.env, RUNLIGHT_HOME: await tempHome() };
    const local = await createLocalServer({ env, host: "127.0.0.1", port: 0 });
    servers.push(() => local.close());
    const baseUrl = `http://127.0.0.1:${local.server.address().port}`;

    const save = await fetch(`${baseUrl}/api/user-settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer shared-secret",
      },
      body: JSON.stringify({ theme: "light", language: "zh-CN" }),
    });
    assert.equal(save.status, 200);

    const settings = await (await fetch(`${baseUrl}/api/user-settings`, {
      headers: { authorization: "Bearer shared-secret" },
    })).json();
    assert.equal(settings.settings.theme, "light");
    assert.equal(settings.settings.language, "zh-CN");

    const user = await (await fetch(`${baseUrl}/api/users/current`, {
      headers: { authorization: "Bearer shared-secret" },
    })).json();
    assert.match(user.user_id, /^token:/);
  });

  it("keeps a recent open turn running after a tool finishes", async () => {
    const env = { ...process.env, RUNLIGHT_HOME: await tempHome() };
    const local = await createLocalServer({ env, host: "127.0.0.1", port: 0 });
    servers.push(() => local.close());
    const baseUrl = `http://127.0.0.1:${local.server.address().port}`;

    const started = {
      ...event("sess-active-local", "message.started"),
      event_time: new Date(Date.now() - 60 * 1000).toISOString(),
    };
    const toolFinished = {
      ...event("sess-active-local", "tool.finished"),
      event_time: new Date(Date.now() - 30 * 1000).toISOString(),
    };

    const ingest = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [started, toolFinished] }),
    });
    assert.equal(ingest.status, 200);

    const session = await (await fetch(`${baseUrl}/api/sessions/sess-active-local`)).json();
    assert.equal(session.current_status, "running");
    assert.equal(session.active_run_started_at, started.event_time);
    assert.equal(session.current_run_started_at, started.event_time);
  });

  it("marks a quiet open turn stale after a tool finishes", async () => {
    const env = { ...process.env, RUNLIGHT_HOME: await tempHome() };
    const local = await createLocalServer({ env, host: "127.0.0.1", port: 0 });
    servers.push(() => local.close());
    const baseUrl = `http://127.0.0.1:${local.server.address().port}`;

    const started = {
      ...event("sess-stale-active-local", "message.started"),
      event_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const toolFinished = {
      ...event("sess-stale-active-local", "tool.finished"),
      event_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };

    const ingest = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [started, toolFinished] }),
    });
    assert.equal(ingest.status, 200);

    const session = await (await fetch(`${baseUrl}/api/sessions/sess-stale-active-local`)).json();
    assert.equal(session.current_status, "stale");
    assert.equal(session.active_run_started_at, started.event_time);
    assert.equal(session.current_run_started_at, started.event_time);
  });
});
