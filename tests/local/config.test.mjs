import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { clearUploadToken, normalizeServerUrl, updateConfig } from "../../src/local/config.js";

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("local config normalization", () => {
  it("accepts pasted API and dashboard URLs", () => {
    assert.equal(
      normalizeServerUrl("https://runlight.example.com/api/health"),
      "https://runlight.example.com",
    );
    assert.equal(
      normalizeServerUrl("https://runlight.example.com/server/api/health"),
      "https://runlight.example.com/server",
    );
    assert.equal(
      normalizeServerUrl("https://runlight.example.com/settings"),
      "https://runlight.example.com",
    );
    assert.equal(
      normalizeServerUrl("https://runlight.example.com/connect"),
      "https://runlight.example.com",
    );
  });

  it("clears the upload token while preserving local identity", async () => {
    const home = await tempDir("runlight-config-home-");
    const env = { ...process.env, RUNLIGHT_HOME: home };
    const before = await updateConfig({
      server_url: "https://runlight.example.com",
      upload_token: "rl_tok_secret",
    }, env);

    const after = await clearUploadToken(env);

    assert.equal(after.upload_token, "");
    assert.equal(after.server_url, "https://runlight.example.com");
    assert.equal(after.machine_id, before.machine_id);
    assert.equal(after.local_secret, before.local_secret);
  });
});
