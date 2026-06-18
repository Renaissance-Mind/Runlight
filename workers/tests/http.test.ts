import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { parseCorsOrigins } from "../src/cors.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(testDir, "../src/index.ts"), "utf8");
const sessionsSource = readFileSync(join(testDir, "../src/routes/sessions.ts"), "utf8");

describe("worker HTTP contract", () => {
  it("allows browser clients to preflight session deletion", () => {
    assert.match(
      indexSource,
      /allowMethods:\s*\[[^\]]*"DELETE"[^\]]*"PATCH"|allowMethods:\s*\[[^\]]*"PATCH"[^\]]*"DELETE"/s,
    );
  });

  it("treats wildcard CORS config as a browser-origin echo", async () => {
    const origin = parseCorsOrigins("*");

    assert.equal(typeof origin, "function");
    assert.equal(origin("http://127.0.0.1:5176"), "http://127.0.0.1:5176");
    assert.equal(origin(""), null);
    assert.match(indexSource, /credentials:\s*true/);
  });

  it("exposes recent events for the messages feed", () => {
    assert.match(sessionsSource, /sessions\.get\("\/events\/recent"/);
  });

  it("returns JSON for unknown API routes instead of the dashboard shell", () => {
    assert.match(indexSource, /pathname\.startsWith\("\/api\/"\)/);
    assert.match(indexSource, /API route not found/);
  });

  it("exposes machine identity fields for dashboard device grouping", () => {
    assert.match(sessionsSource, /machine_arch:\s*row\.machine_arch/);
    assert.match(sessionsSource, /machine_user:\s*row\.machine_user/);
    assert.match(sessionsSource, /machine_id:\s*row\.machine_id/);
  });
});
