import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthLoginUrl,
  buildApiUrl,
  buildRequestHeaders,
  parseStoredDashboardConfig,
  readStoredDashboardConfig,
  resolveDashboardConfig,
} from "../src/api/config.ts";

describe("dashboard server connection config", () => {
  it("defaults to the local Runlight server", () => {
    const config = resolveDashboardConfig({});

    assert.deepEqual(config, {
      serverUrl: "http://127.0.0.1:8766",
      token: "",
    });
  });

  it("uses explicit server URL and token env values", () => {
    const config = resolveDashboardConfig({
      VITE_RUNLIGHT_SERVER_URL: "https://monitor.example.com/",
      VITE_RUNLIGHT_TOKEN: "tok-user-1",
    });

    assert.deepEqual(config, {
      serverUrl: "https://monitor.example.com",
      token: "tok-user-1",
    });
  });

  it("accepts legacy AgentMonitor env values", () => {
    const config = resolveDashboardConfig({
      VITE_AGENT_MONITOR_SERVER_URL: "https://legacy.example.com/",
      VITE_AGENT_MONITOR_TOKEN: "legacy-token",
    });

    assert.deepEqual(config, {
      serverUrl: "https://legacy.example.com",
      token: "legacy-token",
    });
  });

  it("lets stored runtime config override env values", () => {
    const config = resolveDashboardConfig(
      {
        VITE_RUNLIGHT_SERVER_URL: "https://env.example.com",
        VITE_RUNLIGHT_TOKEN: "env-token",
      },
      {
        serverUrl: "https://runtime.example.com/",
        token: "runtime-token",
      },
    );

    assert.deepEqual(config, {
      serverUrl: "https://runtime.example.com",
      token: "runtime-token",
    });
  });

  it("ignores malformed stored runtime config", () => {
    assert.equal(parseStoredDashboardConfig("not json"), null);
    assert.equal(parseStoredDashboardConfig('{"serverUrl": 12}'), null);
  });

  it("reads legacy stored runtime config when the new key is absent", () => {
    const storage = {
      getItem(key: string) {
        if (key === "agent-monitor.dashboard.connection") {
          return JSON.stringify({
            serverUrl: "https://legacy-runtime.example.com/",
            token: "legacy-runtime-token",
          });
        }
        return null;
      },
    };

    assert.deepEqual(readStoredDashboardConfig(storage), {
      serverUrl: "https://legacy-runtime.example.com",
      token: "legacy-runtime-token",
    });
  });

  it("builds absolute API URLs for remote servers", () => {
    assert.equal(
      buildApiUrl("https://monitor.example.com/base", "/sessions/live"),
      "https://monitor.example.com/base/api/sessions/live",
    );
  });

  it("normalizes pasted API and dashboard URLs back to the server root", () => {
    assert.equal(
      buildApiUrl("https://runlight.example.com/api/health", "/health"),
      "https://runlight.example.com/api/health",
    );
    assert.equal(
      buildApiUrl("https://runlight.example.com/server/api/health", "/health"),
      "https://runlight.example.com/server/api/health",
    );
    assert.equal(
      buildApiUrl("https://runlight.example.com/settings", "/tokens"),
      "https://runlight.example.com/api/tokens",
    );
  });

  it("builds OAuth login URLs from the configured server origin", () => {
    assert.equal(
      buildAuthLoginUrl("https://runlight.example.com/", "github", "/messages"),
      "https://runlight.example.com/auth/login/github?return_to=%2Fmessages",
    );
    assert.equal(
      buildAuthLoginUrl("https://runlight.example.com/server", "google", "//evil.example"),
      "https://runlight.example.com/server/auth/login/google?return_to=%2F",
    );
  });

  it("adds bearer authorization only when a token is configured", () => {
    assert.deepEqual(buildRequestHeaders("tok-user-1"), {
      "Content-Type": "application/json",
      Authorization: "Bearer tok-user-1",
    });

    assert.deepEqual(buildRequestHeaders(""), {
      "Content-Type": "application/json",
    });
  });
});
