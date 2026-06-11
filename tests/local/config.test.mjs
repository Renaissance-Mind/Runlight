import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeServerUrl } from "../../src/local/config.js";

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
  });
});
