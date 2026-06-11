import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { resolveRequestUser } from "../src/auth.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const ingestSource = readFileSync(join(testDir, "../src/routes/ingest.ts"), "utf8");

class EmptyStatement {
  bind() {
    return this;
  }

  async first() {
    return null;
  }
}

class EmptyDb {
  prepare() {
    return new EmptyStatement();
  }
}

describe("worker ingest health", () => {
  it("exposes a bearer-token health route for daemon checks", () => {
    assert.match(ingestSource, /ingest\.get\("\/ingest\/health"/);
  });

  it("accepts mapped upload tokens used by daemon health checks", async () => {
    const userId = await resolveRequestUser(
      { DB: new EmptyDb(), RUNLIGHT_TOKEN_MAP: "tok-a:user-a", RUNLIGHT_REQUIRE_AUTH: "true" },
      new Request("https://runlight.example.com/api/ingest/health", {
        headers: { authorization: "Bearer tok-a" },
      }),
    );

    assert.equal(userId, "user-a");
  });

  it("rejects anonymous daemon health checks when auth is required", async () => {
    await assert.rejects(
      () => resolveRequestUser(
        { DB: new EmptyDb(), RUNLIGHT_REQUIRE_AUTH: "true" },
        new Request("https://runlight.example.com/api/ingest/health"),
      ),
      /Authentication required/,
    );
  });
});
