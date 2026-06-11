import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createUploadToken, previewToken } from "../src/routes/tokens.ts";
import type { Env } from "../src/types.ts";

class InsertStatement {
  readonly binds: unknown[][] = [];

  bind(...values: unknown[]) {
    this.binds.push(values);
    return this;
  }

  async run() {
    return { meta: { last_row_id: 42 } };
  }
}

class InsertDb {
  readonly statement = new InsertStatement();

  prepare() {
    return this.statement;
  }
}

describe("worker upload token routes", () => {
  it("formats token previews without exposing the whole credential", () => {
    assert.equal(
      previewToken("rl_tok_abcdefghijklmnopqrstuvwxyz1234567890"),
      "rl_tok_abcd...7890",
    );
  });

  it("creates a scoped upload token for the authenticated user", async () => {
    const db = new InsertDb();
    const token = await createUploadToken(
      { DB: db } as unknown as Env,
      "alice@example.com",
      "2026-06-11T08:00:00.000Z",
    );

    assert.equal(token.id, 42);
    assert.match(token.token, /^rl_tok_/);
    assert.equal(token.user_id, "alice@example.com");
    assert.equal(token.created_at, "2026-06-11T08:00:00.000Z");
    assert.equal(db.statement.binds[0][1], "alice@example.com");
    assert.equal(db.statement.binds[0][2], "2026-06-11T08:00:00.000Z");
  });
});
