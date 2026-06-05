import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApiUrl,
  buildRequestHeaders,
  parseStoredDashboardConfig,
  resolveDashboardConfig,
} from "../src/api/config.ts";

describe("dashboard server connection config", () => {
  it("defaults to the local AgentMonitor server", () => {
    const config = resolveDashboardConfig({});

    assert.deepEqual(config, {
      serverUrl: "http://127.0.0.1:8766",
      token: "",
    });
  });

  it("uses explicit server URL and token env values", () => {
    const config = resolveDashboardConfig({
      VITE_AGENT_MONITOR_SERVER_URL: "https://monitor.example.com/",
      VITE_AGENT_MONITOR_TOKEN: "tok-user-1",
    });

    assert.deepEqual(config, {
      serverUrl: "https://monitor.example.com",
      token: "tok-user-1",
    });
  });

  it("lets stored runtime config override env values", () => {
    const config = resolveDashboardConfig(
      {
        VITE_AGENT_MONITOR_SERVER_URL: "https://env.example.com",
        VITE_AGENT_MONITOR_TOKEN: "env-token",
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

  it("builds absolute API URLs for remote servers", () => {
    assert.equal(
      buildApiUrl("https://monitor.example.com/base", "/sessions/live"),
      "https://monitor.example.com/base/api/sessions/live",
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
