import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveUser } from "../src/auth.ts";

describe("worker auth contract", () => {
  it("maps missing authorization to the default user even when tokens exist", () => {
    const userId = resolveUser({ TOKEN_MAP: "tok-a:user-a" }, null);

    assert.equal(userId, "default");
  });

  it("maps blank bearer tokens to the default user", () => {
    const userId = resolveUser({ TOKEN_MAP: "tok-a:user-a" }, "Bearer   ");

    assert.equal(userId, "default");
  });

  it("maps known bearer tokens to configured users", () => {
    const userId = resolveUser(
      { TOKEN_MAP: "tok-a:user-a, ,tok-b:user-b" },
      "Bearer tok-b",
    );

    assert.equal(userId, "user-b");
  });

  it("rejects unknown bearer tokens when a token map is configured", () => {
    assert.throws(
      () => resolveUser({ TOKEN_MAP: "tok-a:user-a" }, "Bearer missing"),
      /Unknown token/,
    );
  });
});
