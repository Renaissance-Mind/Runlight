import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(testDir, "../src/index.ts"), "utf8");

describe("worker HTTP contract", () => {
  it("allows browser clients to preflight session deletion", () => {
    assert.match(
      indexSource,
      /allowMethods:\s*\[[^\]]*"DELETE"/s,
    );
  });
});
