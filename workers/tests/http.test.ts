import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

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

  it("exposes recent events for the messages feed", () => {
    assert.match(sessionsSource, /sessions\.get\("\/events\/recent"/);
  });

  it("returns JSON for unknown API routes instead of the dashboard shell", () => {
    assert.match(indexSource, /pathname\.startsWith\("\/api\/"\)/);
    assert.match(indexSource, /API route not found/);
  });
});
