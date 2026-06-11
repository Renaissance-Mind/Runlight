import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startOAuth } from "../src/oauth.ts";
import type { Env } from "../src/types.ts";

class StatementRecorder {
  private readonly sink: unknown[][];

  constructor(sink: unknown[][]) {
    this.sink = sink;
  }

  bind(...values: unknown[]) {
    this.sink.push(values);
    return this;
  }

  async run() {
    return {};
  }
}

class RecordingDb {
  readonly binds: unknown[][] = [];

  prepare() {
    return new StatementRecorder(this.binds);
  }
}

describe("worker OAuth routes", () => {
  it("starts GitHub OAuth with the public base callback and safe return path", async () => {
    const db = new RecordingDb();
    const env = {
      DB: db,
      PUBLIC_BASE_URL: "https://runlight.example.com",
      GITHUB_CLIENT_ID: "gh_client",
    } as unknown as Env;

    const response = await startOAuth(
      new Request("https://internal.worker/auth/login/github?return_to=/messages"),
      env,
      "github",
    );

    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("Location") ?? "");
    assert.equal(location.origin + location.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(location.searchParams.get("client_id"), "gh_client");
    assert.equal(
      location.searchParams.get("redirect_uri"),
      "https://runlight.example.com/auth/callback/github",
    );
    assert.equal(location.searchParams.get("scope"), "user:email");
    assert.equal(db.binds[0][1], "github");
    assert.equal(db.binds[0][2], "/messages");
  });

  it("starts Google OAuth with a generated state and openid email profile scopes", async () => {
    const db = new RecordingDb();
    const env = {
      DB: db,
      PUBLIC_BASE_URL: "https://runlight.example.com",
      GOOGLE_CLIENT_ID: "google_client",
    } as unknown as Env;

    const response = await startOAuth(
      new Request("https://runlight.example.com/auth/login/google?return_to=https://evil.example"),
      env,
      "google",
    );

    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("Location") ?? "");
    assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(location.searchParams.get("client_id"), "google_client");
    assert.equal(
      location.searchParams.get("redirect_uri"),
      "https://runlight.example.com/auth/callback/google",
    );
    assert.equal(location.searchParams.get("response_type"), "code");
    assert.equal(location.searchParams.get("scope"), "openid email profile");
    assert.match(location.searchParams.get("state") ?? "", /^oauth_/);
    assert.equal(db.binds[0][2], "/");
  });
});
