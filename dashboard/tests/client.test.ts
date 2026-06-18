import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import {
  createUploadToken,
  deleteSession,
  deleteUploadToken,
  completeCliConnect,
  fetchCurrentUser,
  fetchDevices,
  fetchUploadTokens,
  fetchUserSettings,
  probeServerConnection,
  saveUserSettings,
} from "../src/api/client.ts";

let serverUrl = "";
let lastAuthorization: string | undefined;
let lastCookie: string | undefined;

const server = createServer((req, res) => {
  lastAuthorization = req.headers.authorization;
  lastCookie = req.headers.cookie;
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/health") {
    res.end(JSON.stringify({ status: "ok", service: "runlight" }));
    return;
  }

  if (req.url === "/html/api/health") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html><body>Runlight</body></html>");
    return;
  }

  if (req.url === "/api/users/current") {
    res.end(JSON.stringify({ user_id: lastAuthorization ? "user-alice" : "default" }));
    return;
  }

  if (req.url === "/api/devices") {
    res.end(JSON.stringify({
      devices: [
        {
          device_key: "id:machine-1",
          device_name: "studio-mac",
          device_meta: "darwin / chunqiu",
          machine_hostname: "studio-mac",
          machine_os: "darwin",
          machine_arch: "arm64",
          machine_user: "chunqiu",
          machine_id: "machine-1",
          first_seen_at: "2026-06-18T08:00:00.000Z",
          last_connected_at: "2026-06-18T08:05:00.000Z",
          last_event_at: "2026-06-18T08:04:00.000Z",
          last_heartbeat_at: "2026-06-18T08:05:00.000Z",
          latest_session_id: "sess-1",
          latest_session_status: "running",
          open_session_count: 1,
          session_count: 3,
        },
      ],
    }));
    return;
  }

  if (req.url === "/api/sessions/sess-delete" && req.method === "DELETE") {
    res.end(JSON.stringify({ deleted: "sess-delete" }));
    return;
  }

  if (req.url === "/api/tokens" && req.method === "GET") {
    res.end(JSON.stringify({
      tokens: [
        {
          id: 42,
          token_preview: "rl_tok_abcd...7890",
          created_at: "2026-06-11T08:00:00.000Z",
        },
      ],
    }));
    return;
  }

  if (req.url === "/api/tokens" && req.method === "POST") {
    res.end(JSON.stringify({
      token: {
        id: 43,
        user_id: "user-alice",
        token: "rl_tok_secret",
        token_preview: "rl_tok_sec...cret",
        created_at: "2026-06-11T08:01:00.000Z",
      },
    }));
    return;
  }

  if (req.url === "/api/tokens/42" && req.method === "DELETE") {
    res.end(JSON.stringify({ deleted: 42 }));
    return;
  }

  if (req.url === "/api/user-settings" && req.method === "GET") {
    res.end(JSON.stringify({
      settings: { theme: "light", language: "zh-CN", updated_at: "2026-06-12T06:30:00.000Z" },
    }));
    return;
  }

  if (req.url === "/api/user-settings" && req.method === "PATCH") {
    res.end(JSON.stringify({
      settings: { theme: "dark", language: "en", updated_at: "2026-06-12T06:31:00.000Z" },
    }));
    return;
  }

  if (req.url === "/api/connect/cli" && req.method === "POST") {
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

describe("dashboard runtime API client", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("missing server address");
        }
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetches current user with the configured token", async () => {
    const user = await fetchCurrentUser({ serverUrl, token: "tok-user-1" });

    assert.deepEqual(user, { user_id: "user-alice" });
    assert.equal(lastAuthorization, "Bearer tok-user-1");
    assert.equal(lastCookie, undefined);
  });

  it("omits browser credentials when a bearer token is configured", async () => {
    const originalFetch = globalThis.fetch;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ user_id: "user-alice" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await fetchCurrentUser({ serverUrl: "https://runlight.example.com", token: "tok-user-1" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(capturedInit?.credentials, "omit");
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer tok-user-1");
  });

  it("includes browser credentials when no bearer token is configured", async () => {
    const originalFetch = globalThis.fetch;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ user_id: "default" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await fetchCurrentUser({ serverUrl: "https://runlight.example.com", token: "" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(capturedInit?.credentials, "include");
  });

  it("probes health and current user for reusable dashboard surfaces", async () => {
    const probe = await probeServerConnection({ serverUrl, token: "" });

    assert.equal(probe.ok, true);
    assert.equal(probe.serverUrl, serverUrl);
    assert.equal(probe.userId, "default");
    assert.equal(probe.tokenConfigured, false);
    assert.equal(typeof probe.checkedAt, "string");
    assert.equal(probe.error, null);
  });

  it("fetches connected devices from the configured server", async () => {
    const devices = await fetchDevices({ serverUrl, token: "tok-user-1" });

    assert.equal(devices.length, 1);
    assert.equal(devices[0].device_name, "studio-mac");
    assert.equal(devices[0].last_connected_at, "2026-06-18T08:05:00.000Z");
    assert.equal(devices[0].open_session_count, 1);
    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("reports HTML responses as server URL mistakes instead of JSON parser errors", async () => {
    const probe = await probeServerConnection({ serverUrl: `${serverUrl}/html`, token: "" });

    assert.equal(probe.ok, false);
    assert.match(probe.error ?? "", /API returned HTML instead of JSON/);
    assert.doesNotMatch(probe.error ?? "", /Unexpected token/);
  });

  it("deletes a session with the configured token", async () => {
    await deleteSession("sess-delete", { serverUrl, token: "tok-user-1" });

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("manages upload tokens through the configured server", async () => {
    const config = { serverUrl, token: "tok-user-1" };

    assert.deepEqual(await fetchUploadTokens(config), [
      {
        id: 42,
        token_preview: "rl_tok_abcd...7890",
        created_at: "2026-06-11T08:00:00.000Z",
      },
    ]);
    assert.deepEqual(await createUploadToken(config), {
      id: 43,
      user_id: "user-alice",
      token: "rl_tok_secret",
      token_preview: "rl_tok_sec...cret",
      created_at: "2026-06-11T08:01:00.000Z",
    });
    await deleteUploadToken(42, config);

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("loads and saves user settings through the configured server", async () => {
    const config = { serverUrl, token: "tok-user-1" };

    assert.deepEqual(await fetchUserSettings(config), {
      theme: "light",
      language: "zh-CN",
      updated_at: "2026-06-12T06:30:00.000Z",
    });
    assert.deepEqual(await saveUserSettings({ theme: "dark", language: "en" }, config), {
      theme: "dark",
      language: "en",
      updated_at: "2026-06-12T06:31:00.000Z",
    });
    await completeCliConnect("rl_cli_abcdefghijklmnopqrstuvwxyz123456", config);

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });
});
