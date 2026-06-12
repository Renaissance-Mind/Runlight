import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLocalConfigPatch,
  normalizeSelfHostedServerUrl,
  setupModeFromOptions,
} from "../../src/local/setup-plan.js";

describe("setup mode planning", () => {
  it("chooses setup modes from explicit non-interactive options", () => {
    assert.equal(setupModeFromOptions({ cloud: true }), "cloud");
    assert.equal(setupModeFromOptions({ local: true }), "local");
    assert.equal(setupModeFromOptions({ selfHosted: true }), "self-hosted");
    assert.equal(setupModeFromOptions({}), null);
  });

  it("normalizes self-hosted server addresses from host or URL input", () => {
    assert.equal(
      normalizeSelfHostedServerUrl("192.168.1.20", 18765),
      "http://192.168.1.20:18765",
    );
    assert.equal(
      normalizeSelfHostedServerUrl("192.168.1.20:19999", 18765),
      "http://192.168.1.20:19999",
    );
    assert.equal(
      normalizeSelfHostedServerUrl("https://monitor.example.com/api/health", 18765),
      "https://monitor.example.com",
    );
  });

  it("builds local config from concrete ports without storing a mode enum", () => {
    const patch = buildLocalConfigPatch({
      serverPort: 18765,
      dashboardPort: 18766,
      daemonPort: 18767,
    });

    assert.equal(patch.mode, undefined);
    assert.equal(patch.server_url, "http://127.0.0.1:18765");
    assert.equal(patch.upload_token, "");
    assert.equal(patch.daemon.port, 18767);
    assert.deepEqual(patch.managed, {
      server: { enabled: true, host: "127.0.0.1", port: 18765 },
      dashboard: { enabled: true, host: "127.0.0.1", port: 18766 },
    });
  });
});
