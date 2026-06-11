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

  it("prefers RUNLIGHT_TOKEN_MAP over the legacy TOKEN_MAP alias", () => {
    const userId = resolveUser(
      {
        RUNLIGHT_TOKEN_MAP: "tok-new:user-new",
        TOKEN_MAP: "tok-old:user-old",
      },
      "Bearer tok-new",
    );

    assert.equal(userId, "user-new");
  });

  it("rejects unknown bearer tokens when a token map is configured", () => {
    assert.throws(
      () => resolveUser({ TOKEN_MAP: "tok-a:user-a" }, "Bearer missing"),
      /Unknown token/,
    );
  });
});
